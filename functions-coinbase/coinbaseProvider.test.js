const assert = require("node:assert/strict");
const test = require("node:test");
const { assertCoinbaseReadOnlyScopes, createCoinbaseExchangeProvider, normalizeCoinbaseAccount, parsePositiveBalance } = require("./src/providers/coinbaseProvider");

function jsonResponse(data, pagination = {}) {
  return { ok: true, json: async () => ({ data, pagination }) };
}

test("normalizes positive Coinbase crypto account balances", () => {
  assert.deepEqual(normalizeCoinbaseAccount({
    id: "account-id",
    currency: { type: "crypto", code: "ETH", name: "Ethereum", exponent: 8, asset_id: "asset-eth" },
    balance: { amount: "0.12500000" },
  }), {
    assetId: "asset-eth",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 8,
    amount: "0.125",
    rawAmount: "12500000",
    network: null,
  });
});

test("omits zero, fiat and malformed Coinbase balances", () => {
  assert.equal(normalizeCoinbaseAccount({ currency: { type: "crypto", code: "ETH", exponent: 18 }, balance: { amount: "0" } }), null);
  assert.equal(normalizeCoinbaseAccount({ currency: { type: "fiat", code: "USD", exponent: 2 }, balance: { amount: "500" } }), null);
  assert.equal(normalizeCoinbaseAccount({ currency: { type: "crypto", code: "ETH", exponent: 18 }, balance: { amount: "NaN" } }), null);
  assert.deepEqual(parsePositiveBalance("1.25", 2), { amount: "1.25", rawAmount: "125" });
});

test("reads every paginated Coinbase account using read-only GET requests", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return jsonResponse([
        { currency: { type: "crypto", code: "ETH", name: "Ethereum", exponent: 18 }, balance: { amount: "1.5" } },
        { currency: { type: "fiat", code: "EUR", name: "Euro", exponent: 2 }, balance: { amount: "250" } },
      ], { next_uri: "/v2/accounts?starting_after=page-two" });
    }
    return jsonResponse([
      { currency: { type: "crypto", code: "USDC", name: "USD Coin", exponent: 6 }, balance: { amount: "12.500000" } },
      { currency: { type: "crypto", code: "BTC", name: "Bitcoin", exponent: 8 }, balance: { amount: "0" } },
    ]);
  };

  const provider = createCoinbaseExchangeProvider({ fetchImpl });
  const balances = await provider.getBalances("server-access-token");
  assert.deepEqual(balances.map(({ symbol, amount }) => ({ symbol, amount })), [
    { symbol: "ETH", amount: "1.5" },
    { symbol: "USDC", amount: "12.5" },
  ]);
  assert.equal(calls.length, 2);
  assert(calls.every(({ url }) => new URL(url).origin === "https://api.coinbase.com"));
  assert(calls.every(({ options }) => options.method === "GET"));
  assert(calls.every(({ options }) => options.headers.Authorization === "Bearer server-access-token"));
});

test("rejects provider pagination links outside Coinbase API origin", async () => {
  const provider = createCoinbaseExchangeProvider({
    fetchImpl: async () => jsonResponse([], { next_uri: "https://attacker.invalid/v2/accounts" }),
  });
  await assert.rejects(provider.getBalances("server-access-token"), /invalid URL/);
});

test("accepts only explicitly read-only Coinbase OAuth scopes", () => {
  assert.doesNotThrow(() => assertCoinbaseReadOnlyScopes({ scope: "wallet:accounts:read offline_access" }));
  assert.throws(() => assertCoinbaseReadOnlyScopes({}), /did not confirm/);
  assert.throws(() => assertCoinbaseReadOnlyScopes({ scope: "offline_access" }), /read-only/);
  assert.throws(() => assertCoinbaseReadOnlyScopes({ scope: "wallet:accounts:read wallet:transactions:send" }), /read-only/);
});