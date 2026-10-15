const exchangeRatePromiseCache = new Map();

function normalizeCurrencyCode(currency) {
  return String(currency || '').trim().toUpperCase();
}

async function fetchExchangeRate(fromCurrency, toCurrency) {
  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}`
  );

  if (!response.ok) {
    throw new Error('Unable to fetch exchange rate.');
  }

  const payload = await response.json();
  const rate = Number(payload?.rates?.[toCurrency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('No valid exchange rate returned.');
  }

  return rate;
}

export async function getExchangeRate(fromCurrency, toCurrency) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (!from || !to) {
    throw new Error('Both source and target currencies are required.');
  }

  if (from === to) {
    return 1;
  }

  const cacheKey = `${from}:${to}`;
  if (!exchangeRatePromiseCache.has(cacheKey)) {
    exchangeRatePromiseCache.set(cacheKey, fetchExchangeRate(from, to));
  }

  try {
    return await exchangeRatePromiseCache.get(cacheKey);
  } catch (error) {
    exchangeRatePromiseCache.delete(cacheKey);
    throw error;
  }
}

export async function convertCurrencyAmount(amount, fromCurrency, toCurrency) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return numericAmount * rate;
}
