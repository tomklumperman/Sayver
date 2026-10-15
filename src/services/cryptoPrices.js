const PRICE_TTL_MS = 5 * 60 * 1000;
const MISSING_PRICE_TTL_MS = 30 * 60 * 1000;
const MAX_TOKEN_LOOKUPS_PER_ACCOUNT = 20;

const NATIVE_COINGECKO_IDS = {
  'native:ethereum': 'ethereum',
  'native:base': 'ethereum',
  'native:solana': 'solana',
  'native:bitcoin': 'bitcoin',
};

const COINGECKO_TOKEN_PLATFORMS = {
  ethereum: 'ethereum',
  base: 'base',
  solana: 'solana',
};

const priceCache = new Map();
const inFlight = new Map();

class RateLimitedError extends Error {}

function readCache(key) {
  const entry = priceCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.price;
}

function writeCache(key, price) {
  priceCache.set(key, {
    price,
    expiresAt: Date.now() + (price === null ? MISSING_PRICE_TTL_MS : PRICE_TTL_MS),
  });
}

function toPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 429) throw new RateLimitedError('Price provider rate limit reached.');
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function cachedLookup(key, loader) {
  const cached = readCache(key);
  if (cached !== undefined) return Promise.resolve(cached);
  if (inFlight.has(key)) return inFlight.get(key);

  const request = loader()
    .then((price) => {
      writeCache(key, price);
      return price;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function getNativeUsdPrices(coinIds) {
  const uniqueIds = [...new Set(coinIds)];
  const missing = uniqueIds.filter((id) => readCache(`cg:${id}`) === undefined);
  if (missing.length > 0) {
    const payload = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(missing.join(','))}&vs_currencies=usd`
    );
    missing.forEach((id) => writeCache(`cg:${id}`, toPositivePrice(payload?.[id]?.usd)));
  }
  return Object.fromEntries(uniqueIds.map((id) => [id, readCache(`cg:${id}`) ?? null]));
}

// Tokens are priced only by contract address so look-alike tickers never inherit a real asset's price.
function getTokenUsdPrice(network, contractAddress) {
  const platform = COINGECKO_TOKEN_PLATFORMS[network];
  if (!platform || !contractAddress) return Promise.resolve(null);
  const address = network === 'solana' ? contractAddress : contractAddress.toLowerCase();
  return cachedLookup(`cg-token:${platform}:${address}`, async () => {
    const payload = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${encodeURIComponent(address)}&vs_currencies=usd`
    );
    const quote = payload ? Object.values(payload)[0] : null;
    return toPositivePrice(quote?.usd);
  });
}

function getCoinbaseUsdPrice(symbol) {
  const code = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,15}$/.test(code)) return Promise.resolve(null);
  if (code === 'USD') return Promise.resolve(1);
  return cachedLookup(`cb:${code}`, async () => {
    const payload = await fetchJson(`https://api.coinbase.com/v2/prices/${code}-USD/spot`);
    return toPositivePrice(payload?.data?.amount);
  });
}

export function getBalanceKey(balance) {
  return `${balance?.network || ''}:${balance?.assetId || balance?.symbol || ''}`;
}

export function isCoinbaseAccount(account) {
  return account?.source === 'exchange' && account?.provider === 'coinbase';
}

async function getUsdPricesForAccount(account, balances) {
  const prices = {};

  if (isCoinbaseAccount(account)) {
    await Promise.all(balances.map(async (balance) => {
      try {
        prices[getBalanceKey(balance)] = await getCoinbaseUsdPrice(balance.symbol);
      } catch (_error) {
        prices[getBalanceKey(balance)] = null;
      }
    }));
    return prices;
  }

  const nativeBalances = balances.filter((balance) => NATIVE_COINGECKO_IDS[balance.assetId]);
  if (nativeBalances.length > 0) {
    try {
      const nativePrices = await getNativeUsdPrices(nativeBalances.map((balance) => NATIVE_COINGECKO_IDS[balance.assetId]));
      nativeBalances.forEach((balance) => {
        prices[getBalanceKey(balance)] = nativePrices[NATIVE_COINGECKO_IDS[balance.assetId]] ?? null;
      });
    } catch (_error) {
      nativeBalances.forEach((balance) => {
        prices[getBalanceKey(balance)] = null;
      });
    }
  }

  const tokenBalances = balances.filter((balance) => !NATIVE_COINGECKO_IDS[balance.assetId]);
  let rateLimited = false;
  for (const [index, balance] of tokenBalances.entries()) {
    const key = getBalanceKey(balance);
    if (rateLimited || index >= MAX_TOKEN_LOOKUPS_PER_ACCOUNT) {
      prices[key] = null;
      continue;
    }
    try {
      prices[key] = await getTokenUsdPrice(balance.network || account?.network, balance.assetId);
    } catch (error) {
      prices[key] = null;
      rateLimited = error instanceof RateLimitedError;
    }
  }

  return prices;
}

// Returns USD valuations; tokens without a reliable price stay null and are excluded from the total.
export async function valueCryptoAccountUsd(account) {
  const balances = Array.isArray(account?.balances) ? account.balances : [];
  const prices = await getUsdPricesForAccount(account, balances);

  let totalUsd = 0;
  let pricedCount = 0;
  const tokens = {};
  balances.forEach((balance) => {
    const key = getBalanceKey(balance);
    const usdPrice = prices[key] ?? null;
    const amount = Number(balance.amount);
    const usdValue = usdPrice !== null && Number.isFinite(amount) ? amount * usdPrice : null;
    tokens[key] = { usdPrice, usdValue };
    if (usdValue !== null) {
      totalUsd += usdValue;
      pricedCount += 1;
    }
  });

  return {
    totalUsd,
    pricedCount,
    unpricedCount: balances.length - pricedCount,
    tokenCount: balances.length,
    tokens,
  };
}
