const axios = require('axios');

function nowIso() {
  return new Date().toISOString();
}

function logInfo(event, details = {}) {
  console.log(JSON.stringify({ level: 'info', component: 'truelayerProvider', event, at: nowIso(), ...details }));
}

function logError(event, error, details = {}) {
  console.error(JSON.stringify({
    level: 'error',
    component: 'truelayerProvider',
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

function parseScopeList(scopeValue) {
  if (!scopeValue) return [];
  return String(scopeValue)
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractAccountsArray(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function extractBalanceResults(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.balances)) return payload.balances;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.balances)) return payload.data.balances;
  return [];
}

function getEnv() {
  return (process.env.TRUELAYER_ENV || 'sandbox').toLowerCase();
}

function getAuthBaseUrl() {
  return getEnv() === 'sandbox'
    ? 'https://auth.truelayer-sandbox.com'
    : 'https://auth.truelayer.com';
}

function getDataApiBaseUrl() {
  return getEnv() === 'production'
    ? 'https://api.truelayer.com'
    : 'https://api.truelayer-sandbox.com';
}

function getClientConfig() {
  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing TrueLayer env config. Expected TRUELAYER_CLIENT_ID, TRUELAYER_CLIENT_SECRET, TRUELAYER_REDIRECT_URI.');
  }

  return { clientId, clientSecret, redirectUri };
}

async function withRetry(task, options = {}) {
  const retries = Number(options.retries || 2);
  const baseDelayMs = Number(options.baseDelayMs || 300);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retriable = !status || status >= 500 || status === 429;
      if (!retriable || attempt === retries) {
        break;
      }
      const delay = baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

class TrueLayerProvider {
  getName() {
    return 'truelayer';
  }

  buildConnectUrl() {
    const { clientId, redirectUri } = getClientConfig();
    const scope = 'info accounts balance transactions offline_access';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      providers: 'uk-cs-mock',
    });

    logInfo('oauth.url.build', {
      env: getEnv(),
      authBaseUrl: getAuthBaseUrl(),
      dataBaseUrl: getDataApiBaseUrl(),
      providers: 'uk-cs-mock',
      scope,
    });

    return `${getAuthBaseUrl()}/?${params.toString()}`;
  }

  async connect({ code }) {
    const { clientId, clientSecret, redirectUri } = getClientConfig();
    logInfo('oauth.token.exchange.start', {
      env: getEnv(),
      authBaseUrl: getAuthBaseUrl(),
      codePresent: Boolean(code),
      redirectUri,
    });

    return withRetry(async () => {
      const payload = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString();

      const response = await axios.post(
        `${getAuthBaseUrl()}/connect/token`,
        payload,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
      );

      const scopeList = parseScopeList(response?.data?.scope);
      logInfo('oauth.token.exchange.success', {
        tokenType: response?.data?.token_type || null,
        expiresIn: response?.data?.expires_in || null,
        scope: response?.data?.scope || null,
        scopeList,
        accessTokenPreview: redactToken(response?.data?.access_token),
        refreshTokenPresent: Boolean(response?.data?.refresh_token),
      });

      return response.data;
    });
  }

  async refresh({ refreshToken }) {
    const { clientId, clientSecret, redirectUri } = getClientConfig();
    logInfo('oauth.token.refresh.start', {
      env: getEnv(),
      authBaseUrl: getAuthBaseUrl(),
      refreshTokenPresent: Boolean(refreshToken),
      redirectUri,
    });

    return withRetry(async () => {
      const payload = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        refresh_token: refreshToken,
      }).toString();

      const response = await axios.post(
        `${getAuthBaseUrl()}/connect/token`,
        payload,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
      );

      const scopeList = parseScopeList(response?.data?.scope);
      logInfo('oauth.token.refresh.success', {
        tokenType: response?.data?.token_type || null,
        expiresIn: response?.data?.expires_in || null,
        scope: response?.data?.scope || null,
        scopeList,
        accessTokenPreview: redactToken(response?.data?.access_token),
        refreshTokenPresent: Boolean(response?.data?.refresh_token),
      });

      return response.data;
    });
  }

  async getAccounts({ accessToken }) {
    return withRetry(async () => {
      const endpoint = `${getDataApiBaseUrl()}/data/v1/accounts`;
      logInfo('accounts.request.start', {
        env: getEnv(),
        endpoint,
        accessTokenPreview: redactToken(accessToken),
      });

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });

      const rawAccounts = extractAccountsArray(response.data);
      logInfo('accounts.response.raw', {
        status: response.status,
        data: response.data,
      });
      logInfo('accounts.response.parsed', {
        parsedCount: rawAccounts.length,
        accountIds: rawAccounts.map((item) => item?.account_id || item?.id || item?.accountId || null),
      });

      return response.data;
    });
  }

  async getBalances({ accessToken, accountId }) {
    return withRetry(async () => {
      const endpoint = `${getDataApiBaseUrl()}/data/v1/accounts/${encodeURIComponent(accountId)}/balance`;
      logInfo('balances.request.start', {
        env: getEnv(),
        endpoint,
        accountId,
        accessTokenPreview: redactToken(accessToken),
      });

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });

      const balanceResults = extractBalanceResults(response.data);
      logInfo('balances.response.raw', {
        status: response.status,
        accountId,
        data: response.data,
      });
      logInfo('balances.response.parsed', {
        accountId,
        parsedCount: balanceResults.length,
        firstResult: balanceResults[0] || null,
      });

      return response.data;
    });
  }
}

module.exports = {
  TrueLayerProvider,
  withRetry,
};