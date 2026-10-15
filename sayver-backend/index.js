const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { requireUser } = require('./src/auth');
const {
  ensureDb,
  upsertBankConnection,
  getBankConnection,
  deleteBankConnection,
  setConnectionSyncStatus,
  markCallbackProcessed,
  getProcessedCallback,
  getCachedAccounts,
  setCachedAccounts,
  getCachedBalance,
  setCachedBalance,
  upsertFinancialItems,
  getFinancialItems,
} = require('./src/db');
const { TrueLayerProvider } = require('./src/providers/truelayerProvider');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 3001);
const provider = new TrueLayerProvider();
const cacheTtlMs = Number(process.env.ACCOUNTS_CACHE_TTL_MS || 300_000);

function nowIso() {
  return new Date().toISOString();
}

function getExpiryIso(expiresInSeconds) {
  const ttl = Math.max(0, Number(expiresInSeconds || 0));
  return new Date(Date.now() + (ttl * 1000)).toISOString();
}

function isExpired(expiresAtIso) {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() <= (Date.now() + 15_000);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function logInfo(event, details = {}) {
  console.log(JSON.stringify({ level: 'info', event, at: nowIso(), ...details }));
}

function logError(event, error, details = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    at: nowIso(),
    message: error?.message || 'Unknown error',
    status: error?.response?.status || null,
    providerError: error?.response?.data || null,
    ...details,
  }));
}

function redactToken(token) {
  const value = String(token || '');
  if (!value) return null;
  if (value.length <= 10) return '***';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseScopes(scopeValue) {
  if (!scopeValue) return [];
  return String(scopeValue)
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function getMissingRequiredScopes(scopeValue) {
  const expected = ['info', 'accounts', 'balance', 'transactions', 'offline_access'];
  const scopeSet = new Set(parseScopes(scopeValue));
  return expected.filter((scope) => !scopeSet.has(scope));
}

async function refreshAccessTokenForUser(userId) {
  const connection = await getBankConnection(userId, provider.getName());
  if (!connection) {
    return null;
  }

  if (!isExpired(connection.expires_at)) {
    return connection;
  }

  if (!connection.refresh_token) {
    throw new Error('No refresh token available. Please reconnect your bank account.');
  }

  try {
    logInfo('oauth.refresh.start', { userId, provider: provider.getName() });
    const refreshed = await provider.refresh({ refreshToken: connection.refresh_token });
    const next = await upsertBankConnection({
      userId,
      provider: provider.getName(),
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || connection.refresh_token,
      expires_at: getExpiryIso(refreshed.expires_in),
    });
    logInfo('oauth.refresh.success', { userId, provider: provider.getName() });
    return next;
  } catch (error) {
    if (error?.response?.status === 400 || error?.response?.status === 401) {
      await deleteBankConnection(userId, provider.getName());
    }
    logError('oauth.refresh.failed', error, { userId, provider: provider.getName() });
    throw error;
  }
}

async function requireProviderConnection(req, res, next) {
  try {
    const userId = req.user.userId;
    const connection = await refreshAccessTokenForUser(userId);
    if (!connection || !connection.access_token) {
      return res.status(404).json({ error: 'No TrueLayer connection found for this user.' });
    }

    req.connection = connection;
    return next();
  } catch (error) {
    const status = error?.response?.status;
    if (status === 400 || status === 401) {
      return res.status(401).json({ error: 'Bank connection expired. Please reconnect.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to resolve bank connection.' });
  }
}

function normalizeBankAccountItem(account) {
  return {
    name: account?.display_name || account?.account_type || 'Bank account',
    balance: null,
    currency: account?.currency || 'GBP',
    type: 'bank',
    provider: provider.getName(),
    externalAccountId: account?.account_id || account?.id || null,
  };
}

function parseForceRefresh(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFresh(lastSyncedAt, ttlMs) {
  const syncDate = parseDate(lastSyncedAt);
  if (!syncDate) return false;
  return (Date.now() - syncDate.getTime()) < ttlMs;
}

function extractBalanceAmount(payload) {
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!result) return 0;

  const current = Number(result?.current?.amount);
  if (Number.isFinite(current)) return current;

  const available = Number(result?.available?.amount);
  if (Number.isFinite(available)) return available;

  return 0;
}

function extractAccountsFromPayload(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

async function syncAccountsFromProvider(userId, accessToken) {
  await setConnectionSyncStatus(userId, provider.getName(), 'syncing');
  try {
    logInfo('accounts.provider_fetch.start', {
      userId,
      provider: provider.getName(),
      accessTokenPreview: redactToken(accessToken),
    });

    const payload = await provider.getAccounts({ accessToken });
    const accounts = extractAccountsFromPayload(payload);
    logInfo('accounts.provider_fetch.raw_payload', {
      userId,
      provider: provider.getName(),
      payload,
    });
    logInfo('accounts.provider_fetch.parsed', {
      userId,
      provider: provider.getName(),
      parsedCount: accounts.length,
      accountIds: accounts.map((account) => account?.account_id || account?.id || account?.accountId || null),
    });

    const syncedAt = new Date();
    await setCachedAccounts({
      userId,
      provider: provider.getName(),
      accounts,
      syncStatus: 'ok',
      lastSyncedAt: syncedAt,
    });
    return {
      accounts,
      syncedAt,
      source: 'provider',
    };
  } catch (error) {
    await setConnectionSyncStatus(userId, provider.getName(), 'error');
    throw error;
  }
}

async function resolveAccountsForRequest({ userId, accessToken, forceRefresh }) {
  const cached = await getCachedAccounts(userId, provider.getName());
  const fresh = cached && isFresh(cached.lastSyncedAt, cacheTtlMs);

  if (cached && fresh && !forceRefresh) {
    return {
      source: 'cache',
      accounts: cached.accounts || [],
      lastSyncedAt: parseDate(cached.lastSyncedAt),
    };
  }

  try {
    const synced = await syncAccountsFromProvider(userId, accessToken);
    return {
      source: synced.source,
      accounts: synced.accounts,
      lastSyncedAt: synced.syncedAt,
    };
  } catch (error) {
    if (cached?.accounts?.length && !forceRefresh) {
      return {
        source: 'cache-stale',
        accounts: cached.accounts,
        lastSyncedAt: parseDate(cached.lastSyncedAt),
        stale: true,
      };
    }
    throw error;
  }
}

function groupFinancialItems(items = []) {
  return {
    bank_accounts: items.filter((item) => item.type === 'bank'),
    savings_accounts: items.filter((item) => item.type === 'savings'),
    investments: items.filter((item) => item.type === 'investment'),
    crypto_assets: items.filter((item) => item.type === 'crypto'),
  };
}

app.get('/health', (_req, res) => {
  const env = (process.env.TRUELAYER_ENV || 'sandbox').toLowerCase();
  res.json({ ok: true, env, provider: provider.getName() });
});

app.get('/auth/url', requireUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const url = provider.buildConnectUrl();
    logInfo('oauth.url.generated', { userId, provider: provider.getName() });
    res.json({ url });
  } catch (error) {
    logError('oauth.url.failed', error, { userId: req.user?.userId, provider: provider.getName() });
    res.status(500).json({ error: error.message || 'Could not build auth url' });
  }
});

app.get('/auth/callback', requireUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const code = String(req.query.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const codeDigest = hashCode(code);
    const existingCallback = await getProcessedCallback(userId, provider.getName(), codeDigest);
    if (existingCallback) {
      logInfo('oauth.callback.idempotent_hit', { userId, provider: provider.getName() });
      return res.json(existingCallback.payload);
    }

    logInfo('oauth.callback.start', { userId, provider: provider.getName() });
    const tokenResponse = await provider.connect({ code });
    const grantedScopes = parseScopes(tokenResponse?.scope);
    const missingScopes = getMissingRequiredScopes(tokenResponse?.scope);
    logInfo('oauth.callback.token.received', {
      userId,
      provider: provider.getName(),
      tokenType: tokenResponse?.token_type || null,
      expiresIn: tokenResponse?.expires_in || null,
      scope: tokenResponse?.scope || null,
      grantedScopes,
      missingScopes,
      accessTokenPreview: redactToken(tokenResponse?.access_token),
      refreshTokenPresent: Boolean(tokenResponse?.refresh_token),
    });

    const connection = await upsertBankConnection({
      userId,
      provider: provider.getName(),
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: getExpiryIso(tokenResponse.expires_in),
    });

    const responsePayload = {
      provider: provider.getName(),
      token_type: tokenResponse.token_type,
      expires_in: tokenResponse.expires_in,
      scope: tokenResponse.scope || null,
      missing_required_scopes: missingScopes,
      connected: true,
      userId,
      expires_at: connection.expires_at,
    };

    await markCallbackProcessed({
      userId,
      provider: provider.getName(),
      codeHash: codeDigest,
      payload: responsePayload,
    });

    logInfo('oauth.callback.success', { userId, provider: provider.getName() });
    res.json(responsePayload);
  } catch (error) {
    logError('oauth.callback.failed', error, { userId: req.user?.userId, provider: provider.getName() });
    const status = error?.response?.status || 500;
    const message = error?.response?.data || { error: error.message || 'Token exchange failed' };
    res.status(status).json(message);
  }
});

app.post('/auth/refresh', requireUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const connection = await getBankConnection(userId, provider.getName());
    if (!connection) {
      return res.status(404).json({ error: 'No bank connection found.' });
    }

    if (!connection.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available for this user.' });
    }

    const refreshed = await provider.refresh({ refreshToken: connection.refresh_token });
    const updated = await upsertBankConnection({
      userId,
      provider: provider.getName(),
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || connection.refresh_token,
      expires_at: getExpiryIso(refreshed.expires_in),
    });

    logInfo('oauth.refresh.manual_success', { userId, provider: provider.getName() });
    res.json({
      provider: provider.getName(),
      refreshed: true,
      expires_at: updated.expires_at,
    });
  } catch (error) {
    const status = error?.response?.status;
    if (status === 400 || status === 401) {
      await deleteBankConnection(req.user.userId, provider.getName());
      return res.status(401).json({ error: 'Refresh token is invalid or expired. Reconnect your bank account.' });
    }
    logError('oauth.refresh.manual_failed', error, { userId: req.user?.userId, provider: provider.getName() });
    res.status(500).json({ error: error.message || 'Refresh failed' });
  }
});

app.get('/accounts', requireUser, requireProviderConnection, async (req, res) => {
  try {
    const userId = req.user.userId;
    const forceRefresh = parseForceRefresh(String(req.query.forceRefresh || ''));
    const resolved = await resolveAccountsForRequest({
      userId,
      accessToken: req.connection.access_token,
      forceRefresh,
    });

    logInfo('accounts.fetch.success', {
      userId,
      provider: provider.getName(),
      count: resolved.accounts.length,
      source: resolved.source,
      forceRefresh,
    });

    logInfo('accounts.fetch.final_payload', {
      userId,
      provider: provider.getName(),
      source: resolved.source,
      stale: Boolean(resolved.stale),
      count: resolved.accounts.length,
      accountIds: resolved.accounts.map((account) => account?.account_id || account?.id || account?.accountId || null),
      results: resolved.accounts,
    });

    res.json({
      source: resolved.source,
      stale: Boolean(resolved.stale),
      lastSyncedAt: resolved.lastSyncedAt ? resolved.lastSyncedAt.toISOString() : null,
      ttlMs: cacheTtlMs,
      results: resolved.accounts,
    });
  } catch (error) {
    logError('accounts.fetch.failed', error, { userId: req.user?.userId, provider: provider.getName() });
    const status = error?.response?.status || 500;
    const message = error?.response?.data || { error: error.message || 'Fetching accounts failed' };
    res.status(status).json(message);
  }
});

app.get('/balance/:accountId', requireUser, requireProviderConnection, async (req, res) => {
  try {
    const userId = req.user.userId;
    const accountId = String(req.params.accountId || '').trim();
    const forceRefresh = parseForceRefresh(String(req.query.forceRefresh || ''));
    if (!accountId) {
      return res.status(400).json({ error: 'Missing account id' });
    }

    const accountsResult = await resolveAccountsForRequest({
      userId,
      accessToken: req.connection.access_token,
      forceRefresh,
    });
    const accounts = accountsResult.accounts || [];
    const ownedAccount = accounts.find((item) => (item?.account_id || item?.id) === accountId);
    if (!ownedAccount) {
      return res.status(403).json({ error: 'This account does not belong to the authenticated user.' });
    }

    const cachedBalance = await getCachedBalance(userId, provider.getName(), accountId);
    if (!forceRefresh && cachedBalance && isFresh(cachedBalance.updatedAt, cacheTtlMs)) {
      return res.json({
        ...cachedBalance.payload,
        source: 'cache',
        lastSyncedAt: cachedBalance.updatedAt ? cachedBalance.updatedAt.toISOString() : null,
      });
    }

    await setConnectionSyncStatus(userId, provider.getName(), 'syncing');
    const payload = await provider.getBalances({ accessToken: req.connection.access_token, accountId });
    await setCachedBalance({
      userId,
      provider: provider.getName(),
      accountId,
      payload,
      lastSyncedAt: new Date(),
      syncStatus: 'ok',
    });
    res.json({
      ...payload,
      source: 'provider',
      ttlMs: cacheTtlMs,
    });
  } catch (error) {
    await setConnectionSyncStatus(req.user.userId, provider.getName(), 'error');
    logError('balance.fetch.failed', error, { userId: req.user?.userId, provider: provider.getName(), accountId: req.params?.accountId });
    const status = error?.response?.status || 500;
    const message = error?.response?.data || { error: error.message || 'Fetching balance failed' };
    res.status(status).json(message);
  }
});

app.post('/financial-items/sync', requireUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalized = items.map((item) => ({
      name: item?.name,
      balance: item?.balance,
      currency: item?.currency,
      type: item?.type,
      provider: item?.provider,
    }));
    const saved = await upsertFinancialItems(userId, normalized);
    res.json({ saved: saved.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not sync financial items' });
  }
});

app.get('/net-worth', requireUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const forceRefresh = parseForceRefresh(String(req.query.forceRefresh || ''));

    let bankItems = [];
    try {
      const connection = await refreshAccessTokenForUser(userId);
      if (connection?.access_token) {
        const accountResult = await resolveAccountsForRequest({
          userId,
          accessToken: connection.access_token,
          forceRefresh,
        });

        const shouldRefreshBalances = forceRefresh || accountResult.source === 'provider';
        const balanceResults = await Promise.all(accountResult.accounts.map(async (account) => {
          const accountId = account?.account_id || account?.id;
          if (!accountId) return null;

          const item = normalizeBankAccountItem(account);
          if (shouldRefreshBalances) {
            try {
              const balancePayload = await provider.getBalances({ accessToken: connection.access_token, accountId });
              await setCachedBalance({
                userId,
                provider: provider.getName(),
                accountId,
                payload: balancePayload,
                lastSyncedAt: new Date(),
                syncStatus: 'ok',
              });
              item.balance = extractBalanceAmount(balancePayload);
              return item;
            } catch (_error) {
              return null;
            }
          }

          const cachedBalance = await getCachedBalance(userId, provider.getName(), accountId);
          item.balance = cachedBalance?.payload ? extractBalanceAmount(cachedBalance.payload) : 0;
          return item;
        }));

        bankItems = balanceResults.filter(Boolean);
      }
    } catch (error) {
      logError('networth.bank_fetch.failed', error, { userId, provider: provider.getName() });
    }

    const localItems = await getFinancialItems(userId);
    const normalizedLocal = localItems.map((item) => ({
      name: item.name,
      balance: Number(item.balance) || 0,
      currency: item.currency || 'EUR',
      type: item.type || 'savings',
      provider: item.provider || 'manual',
    }));

    const allItems = [...bankItems, ...normalizedLocal];
    const totalsByCurrency = {};
    for (const item of allItems) {
      const currency = item.currency || 'EUR';
      totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + (Number(item.balance) || 0);
    }

    const grouped = groupFinancialItems(allItems);
    res.json({
      items: allItems,
      ...grouped,
      totalsByCurrency,
      totalItems: allItems.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to build net worth data.' });
  }
});

app.use((error, _req, res, _next) => {
  logError('unhandled', error);
  res.status(500).json({ error: 'Internal server error' });
});

ensureDb().then(() => {
  app.listen(port, () => {
    logInfo('server.started', {
      port,
      provider: provider.getName(),
      truelayerEnv: (process.env.TRUELAYER_ENV || 'sandbox').toLowerCase(),
    });
    console.log(`Sayver backend listening on http://localhost:${port}`);
  });
});
