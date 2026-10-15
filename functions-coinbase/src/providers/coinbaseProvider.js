const API_ORIGIN = "https://api.coinbase.com";
const MAX_ACCOUNT_PAGES = 100;

function assertCoinbaseReadOnlyScopes(tokenResponse) {
  if (typeof tokenResponse?.scope !== "string" || !tokenResponse.scope.trim()) {
    throw new Error("Coinbase did not confirm granted account scopes.");
  }
  const scopes = tokenResponse.scope.split(/[\s,]+/).filter(Boolean);
  const hasAccountRead = scopes.includes("wallet:accounts:read");
  const hasWriteScope = scopes.some((scope) => /:(create|update|delete|send|transfer|withdraw|deposit|buy|sell)$/.test(scope));
  if (!hasAccountRead || hasWriteScope) {
    throw new Error("Coinbase did not grant read-only account access.");
  }
}

function parsePositiveBalance(amount, decimals) {
  const normalized = String(amount ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals && /[^0]/.test(fraction.slice(decimals))) return null;
  const rawAmount = BigInt(`${whole}${fraction.slice(0, decimals).padEnd(decimals, "0")}` || "0");
  if (rawAmount <= 0n) return null;
  const visibleFraction = fraction.slice(0, decimals).replace(/0+$/, "");
  return {
    amount: visibleFraction ? `${BigInt(whole).toString()}.${visibleFraction}` : BigInt(whole).toString(),
    rawAmount: rawAmount.toString(),
  };
}

function normalizeCoinbaseAccount(account) {
  const currency = account?.currency || {};
  if (String(currency.type || "").toLowerCase() !== "crypto") return null;
  const decimals = Number(currency.exponent);
  const balance = parsePositiveBalance(account?.balance?.amount, decimals);
  if (!balance) return null;
  const symbol = String(currency.code || "").trim().toUpperCase();
  if (!symbol) return null;
  return {
    assetId: currency.asset_id || symbol,
    symbol,
    name: currency.name || symbol,
    decimals,
    amount: balance.amount,
    rawAmount: balance.rawAmount,
    network: currency.network || null,
  };
}

function createCoinbaseExchangeProvider({ fetchImpl = fetch } = {}) {
  return Object.freeze({
    async getBalances(accessToken) {
      if (!accessToken) throw new Error("Coinbase access token is missing.");
      const balances = [];
      let nextUrl = `${API_ORIGIN}/v2/accounts?limit=100`;
      for (let page = 0; page < MAX_ACCOUNT_PAGES && nextUrl; page += 1) {
        const requestUrl = new URL(nextUrl, API_ORIGIN);
        if (requestUrl.origin !== API_ORIGIN || requestUrl.pathname !== "/v2/accounts") {
          throw new Error("Coinbase pagination returned an invalid URL.");
        }
        const response = await fetchImpl(requestUrl.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error("Coinbase account request failed.");
        const payload = await response.json();
        if (!Array.isArray(payload?.data)) throw new Error("Coinbase returned an invalid accounts response.");
        balances.push(...payload.data.map(normalizeCoinbaseAccount).filter(Boolean));
        nextUrl = payload?.pagination?.next_uri || null;
      }
      if (nextUrl) throw new Error("Coinbase returned too many account pages to sync safely.");
      return balances;
    },
  });
}

module.exports = { assertCoinbaseReadOnlyScopes, createCoinbaseExchangeProvider, normalizeCoinbaseAccount, parsePositiveBalance };