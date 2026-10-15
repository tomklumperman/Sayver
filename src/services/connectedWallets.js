import Constants from 'expo-constants';
import { getAuth } from 'firebase/auth';
import { Platform } from 'react-native';
import { refreshConnectedWallet, updateConnectedWalletSync, upsertConnectedWallet } from '../firebase/firestore';

const PROVIDER_NAME = 'truelayer';

function logTrueLayer(event, details = {}) {
  console.log(`[TrueLayer][${event}]`, details);
}

function extractAccountArray(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

export const BankProvider = {
  connect: 'connect',
  getAccounts: 'getAccounts',
  getBalances: 'getBalances',
};

function getTrueLayerBackendBaseUrl() {
  return Constants?.expoConfig?.extra?.truelayerBackendBaseUrl || 'http://localhost:3001';
}

function getBackendCandidates() {
  const configured = getTrueLayerBackendBaseUrl().replace(/\/$/, '');
  const candidates = [configured];

  if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:3001');
  }

  candidates.push('http://localhost:3001');

  return [...new Set(candidates.filter(Boolean))];
}

function getTrueLayerEnv() {
  return (Constants?.expoConfig?.extra?.truelayerEnv || 'sandbox').toLowerCase();
}

async function getAuthHeaders(userId) {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('You must be signed in before connecting a bank account.');
  }

  if (userId && user.uid !== userId) {
    throw new Error('Signed in user does not match the requested user id.');
  }

  const idToken = await user.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
}

async function trueLayerRequest(path, options = {}, userId) {
  const headers = {
    ...(options.headers || {}),
    ...(await getAuthHeaders(userId)),
  };

  const candidates = getBackendCandidates();
  let lastNetworkError = null;

  for (const baseUrl of candidates) {
    let response;
    try {
      logTrueLayer('backend.request.start', {
        method: options?.method || 'GET',
        path,
        baseUrl,
        userId,
      });
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
      });
    } catch (error) {
      logTrueLayer('backend.request.network_error', {
        method: options?.method || 'GET',
        path,
        baseUrl,
        userId,
        error: error?.message || String(error),
      });
      lastNetworkError = error;
      continue;
    }

    const payload = await response.json().catch(() => null);
    logTrueLayer('backend.request.response', {
      method: options?.method || 'GET',
      path,
      baseUrl,
      userId,
      status: response.status,
      ok: response.ok,
      payload,
    });
    if (!response.ok) {
      const message = payload?.error_description
        || payload?.error
        || payload?.details
        || payload?.message
        || `TrueLayer backend request failed (${response.status})`;
      throw new Error(message);
    }

    return payload;
  }

  const candidateList = candidates.join(', ');
  const networkReason = lastNetworkError?.message || 'Network request failed';
  throw new Error(
    `Could not reach the TrueLayer backend. Tried: ${candidateList}. `
    + `Start the backend and verify expo.extra.truelayerBackendBaseUrl in app.json. (${networkReason})`
  );
}

function extractTrueLayerAccountId(account) {
  return account?.account_id || account?.id || account?.accountId || null;
}

function normalizeTrueLayerAccount(account) {
  const externalAccountId = extractTrueLayerAccountId(account);
  if (!externalAccountId) {
    return null;
  }

  const iban = account?.account_number?.iban || '';
  const number = account?.account_number?.number || '';
  const sortCode = account?.account_number?.sort_code || '';
  const rawIdentifier = iban || `${sortCode}${number}`;
  const identifier = rawIdentifier && rawIdentifier.length > 8
    ? `${rawIdentifier.slice(0, 4)}...${rawIdentifier.slice(-4)}`
    : rawIdentifier || null;

  return {
    externalAccountId,
    accountDisplayName: account?.display_name || account?.account_type || 'Bank account',
    bankName: account?.provider?.display_name || account?.provider?.provider_id || 'Bank',
    maskedIdentifier: identifier,
    currency: account?.currency || 'GBP',
  };
}

function extractTrueLayerBalance(payload) {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.balances)
      ? payload.balances
      : Array.isArray(payload?.data?.results)
        ? payload.data.results
        : Array.isArray(payload?.data?.balances)
          ? payload.data.balances
          : [];

  const result = results[0] || null;
  if (!result) {
    return { amount: null, currency: null };
  }

  const candidates = [
    result?.available,
    result?.current,
    result?.reserved,
    result?.balance,
  ];

  for (const candidate of candidates) {
    const amount = Number(
      typeof candidate === 'number' || typeof candidate === 'string'
        ? candidate
        : candidate?.amount
    );
    if (Number.isFinite(amount)) {
      return {
        amount,
        currency: candidate?.currency || result?.currency || null,
      };
    }
  }

  return { amount: null, currency: null };
}

export async function getTrueLayerAuthUrl(userId) {
  const payload = await trueLayerRequest('/auth/url', { method: 'GET' }, userId);
  if (!payload?.url) {
    throw new Error('No auth url returned by backend.');
  }
  return payload.url;
}

export async function connectAndStoreTrueLayerAccounts(userId, authCode) {
  if (!userId) {
    throw new Error('User id is required to connect a bank account.');
  }

  const normalizedCode = (authCode || '').trim();
  if (!normalizedCode) {
    throw new Error('Missing authorization code from TrueLayer redirect.');
  }

  logTrueLayer('oauth.callback.start', { userId, codeLength: normalizedCode.length });
  const callbackPayload = await trueLayerRequest(`/auth/callback?code=${encodeURIComponent(normalizedCode)}`, { method: 'GET' }, userId);
  logTrueLayer('oauth.callback.success', { userId, callbackPayload });

  const accountsPayload = await trueLayerRequest('/accounts?forceRefresh=true', { method: 'GET' }, userId);
  const accountsRaw = extractAccountArray(accountsPayload);

  logTrueLayer('accounts.raw_response', {
    userId,
    payload: accountsPayload,
  });
  logTrueLayer('accounts.parsed', {
    userId,
    parsedCount: accountsRaw.length,
    accountIds: accountsRaw.map((account) => extractTrueLayerAccountId(account)),
  });

  if (!accountsRaw.length) {
    throw new Error('No bank accounts were returned from TrueLayer.');
  }

  const writes = await Promise.all(accountsRaw.map(async (rawAccount) => {
    const normalized = normalizeTrueLayerAccount(rawAccount);
    logTrueLayer('accounts.normalized_item', {
      userId,
      rawAccount,
      normalized,
    });

    if (!normalized) {
      logTrueLayer('accounts.skipped.no_external_id', {
        userId,
        rawAccount,
      });
      return null;
    }

    const balancePayload = await trueLayerRequest(`/balance/${encodeURIComponent(normalized.externalAccountId)}?forceRefresh=true`, { method: 'GET' }, userId);
    logTrueLayer('balances.raw_response', {
      userId,
      accountId: normalized.externalAccountId,
      payload: balancePayload,
    });

    const balance = extractTrueLayerBalance(balancePayload);
    logTrueLayer('balances.parsed', {
      userId,
      accountId: normalized.externalAccountId,
      parsedBalance: balance,
    });

    if (typeof balance.amount !== 'number') {
      logTrueLayer('accounts.skipped.no_balance_amount', {
        userId,
        accountId: normalized.externalAccountId,
        balancePayload,
      });
      return null;
    }

    return upsertConnectedWallet(userId, {
      provider: PROVIDER_NAME,
      nickname: normalized.accountDisplayName,
      bankName: normalized.bankName,
      externalAccountId: normalized.externalAccountId,
      accountDisplayName: normalized.accountDisplayName,
      accountIdentifier: normalized.maskedIdentifier,
      currency: balance.currency || normalized.currency || 'GBP',
      totalBalance: balance.amount,
      readOnly: true,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      lastSyncedAt: new Date(),
      syncStatus: 'ok',
      syncMessage: null,
      sandboxMode: getTrueLayerEnv() !== 'production',
    });
  }));

  const syncedCount = writes.filter(Boolean).length;
  logTrueLayer('accounts.final_result', {
    userId,
    rawCount: accountsRaw.length,
    syncedCount,
    droppedCount: accountsRaw.length - syncedCount,
  });
  return syncedCount;
}

export async function syncConnectedWalletBalance(userId, wallet, options = {}) {
  if (!userId || !wallet?.id) {
    return;
  }

  const provider = (wallet?.provider || '').toLowerCase();
  if (provider !== PROVIDER_NAME) {
    throw new Error('Only TrueLayer-connected bank accounts are supported in this flow.');
  }

  try {
    const accountId = wallet?.externalAccountId;
    if (!accountId) {
      throw new Error('Missing external account id for synced wallet.');
    }

    const forceRefresh = options?.forceRefresh === true;
    const query = forceRefresh ? '?forceRefresh=true' : '';
    const balancePayload = await trueLayerRequest(`/balance/${encodeURIComponent(accountId)}${query}`, { method: 'GET' }, userId);
    const balance = extractTrueLayerBalance(balancePayload);

    if (typeof balance.amount !== 'number') {
      throw new Error('No synced balance found for this TrueLayer account.');
    }

    await refreshConnectedWallet(userId, wallet.id, {
      totalBalance: balance.amount,
      currency: balance.currency || wallet?.currency || 'GBP',
      syncStatus: 'ok',
      syncMessage: null,
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    await updateConnectedWalletSync(userId, wallet.id, {
      syncStatus: 'error',
      syncMessage: error?.message || 'Wallet sync failed',
      lastSyncedAt: new Date(),
    });
    throw error;
  }
}

export async function syncAllConnectedWallets(userId, wallets) {
  if (!userId || !Array.isArray(wallets) || wallets.length === 0) {
    return;
  }

  for (const wallet of wallets) {
    if ((wallet?.provider || '').toLowerCase() !== PROVIDER_NAME) {
      continue;
    }

    try {
      await syncConnectedWalletBalance(userId, wallet, { forceRefresh: true });
    } catch (error) {
      console.warn(`Connected wallet sync failed for ${wallet?.id}:`, error?.message || error);
    }
  }
}
