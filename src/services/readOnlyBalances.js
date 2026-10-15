import { updateReadOnlyAccountBalance } from '../firebase/firestore';

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

async function fetchCryptoBalance(account) {
  const coinId = (account?.marketSymbol || '').trim().toLowerCase();
  const quantity = normalizeNumber(account?.readOnlyConfig?.quantity ?? account?.quantity);

  if (!coinId || !quantity) {
    return null;
  }

  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd,eur,gbp`);
  if (!response.ok) {
    throw new Error('Unable to fetch crypto quote.');
  }

  const payload = await response.json();
  const quote = payload?.[coinId];
  if (!quote) {
    throw new Error('Crypto symbol/id not found.');
  }

  const preferredCurrency = (account?.readOnlyConfig?.currency || 'eur').toLowerCase();
  const fx = normalizeNumber(quote[preferredCurrency]) || normalizeNumber(quote.eur) || normalizeNumber(quote.usd);
  if (!fx) {
    throw new Error('No usable quote value returned.');
  }

  return {
    balance: quantity * fx,
    message: `${quantity} ${coinId} @ ${fx.toFixed(2)} ${preferredCurrency.toUpperCase()}`,
  };
}

async function fetchInvestmentBalance(account) {
  const symbol = (account?.marketSymbol || '').trim().toUpperCase();
  const quantity = normalizeNumber(account?.readOnlyConfig?.quantity ?? account?.quantity);

  if (!symbol || !quantity) {
    return null;
  }

  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  if (!response.ok) {
    throw new Error('Unable to fetch investment quote.');
  }

  const payload = await response.json();
  const close = normalizeNumber(payload?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!close) {
    throw new Error('No usable market price found for symbol.');
  }

  return {
    balance: quantity * close,
    message: `${quantity} ${symbol} @ ${close.toFixed(2)}`,
  };
}

async function fetchBankingBalanceViaProxy(account, userId) {
  const endpoint = (account?.readOnlyConfig?.connectorEndpoint || account?.readOnlyConfig?.externalAccountRef || '').trim();
  if (!endpoint) {
    return null;
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'x-finances-user-id': userId,
      'x-read-only-sync': 'true',
    },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch bank balance from read-only proxy.');
  }

  const payload = await response.json();
  const balance = normalizeNumber(payload?.balance);
  if (balance === null) {
    throw new Error('Banking proxy did not return a valid balance number.');
  }

  return {
    balance,
    message: payload?.message || 'Bank read-only proxy sync',
  };
}

async function fetchViaConnector(account, userId) {
  const endpoint = (account?.readOnlyConfig?.connectorEndpoint || '').trim();
  if (!endpoint) {
    return null;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-finances-user-id': userId,
      'x-read-only-sync': 'true',
    },
    body: JSON.stringify({
      accountId: account?.id,
      connectionType: account?.readOnlyConfig?.connectionType || null,
      provider: account?.readOnlyConfig?.provider || null,
      integrationMode: account?.readOnlyConfig?.integrationMode || null,
      externalAccountRef: account?.readOnlyConfig?.externalAccountRef || null,
      marketSymbol: account?.marketSymbol || null,
      quantity: account?.readOnlyConfig?.quantity ?? null,
      walletAddress: account?.readOnlyConfig?.walletAddress || null,
      walletChain: account?.readOnlyConfig?.walletChain || null,
      apiKey: account?.readOnlyConfig?.apiKey || null,
      apiSecret: account?.readOnlyConfig?.apiSecret || null,
      apiPassphrase: account?.readOnlyConfig?.apiPassphrase || null,
    }),
  });

  if (!response.ok) {
    throw new Error('Read-only connector failed to return a balance.');
  }

  const payload = await response.json();
  const balance = normalizeNumber(payload?.balance);
  if (balance === null) {
    throw new Error('Read-only connector did not return a valid balance.');
  }

  return {
    balance,
    message: payload?.message || 'Connector read-only sync',
  };
}

async function fetchWalletBalance(account) {
  const walletAddress = (account?.readOnlyConfig?.walletAddress || '').trim();
  const provider = (account?.readOnlyConfig?.provider || '').trim().toLowerCase();

  if (!walletAddress) {
    return null;
  }

  if (provider === 'debank') {
    const response = await fetch(`https://openapi.debank.com/v1/user/total_balance?id=${encodeURIComponent(walletAddress)}`);
    if (!response.ok) {
      throw new Error('Unable to fetch wallet balance from DeBank.');
    }

    const payload = await response.json();
    const usdBalance = normalizeNumber(payload?.total_usd_value);
    if (usdBalance === null) {
      throw new Error('DeBank did not return a valid total balance.');
    }

    return {
      balance: usdBalance,
      message: `Wallet ${walletAddress.slice(0, 8)}... synced via DeBank`,
    };
  }

  if (provider === 'zerion' || provider === 'covalent') {
    throw new Error('Zerion/Covalent wallet sync requires a backend connector endpoint for secure API-key usage.');
  }

  return null;
}

export async function fetchReadOnlyExternalBalance(account, userId) {
  if (!account?.readOnlyConfig?.enabled) {
    return null;
  }

  if (account?.readOnlyConfig?.connectorEndpoint) {
    return fetchViaConnector(account, userId);
  }

  const sourceType = (account?.readOnlyConfig?.connectionType || account?.type || '').toLowerCase();
  const integrationMode = (account?.readOnlyConfig?.integrationMode || '').toLowerCase();

  if (integrationMode === 'wallet-address') {
    return fetchWalletBalance(account);
  }

  if (sourceType === 'crypto') {
    return fetchCryptoBalance(account);
  }

  if (sourceType === 'investment') {
    return fetchInvestmentBalance(account);
  }

  if (sourceType === 'bank' || sourceType === 'banking') {
    return fetchBankingBalanceViaProxy(account, userId);
  }

  return null;
}

export async function syncReadOnlyLinkedAccounts(userId, accounts) {
  if (!userId || !Array.isArray(accounts) || accounts.length === 0) {
    return;
  }

  for (const account of accounts) {
    if (!account?.readOnlyConfig?.enabled) {
      continue;
    }

    try {
      const syncResult = await fetchReadOnlyExternalBalance(account, userId);
      if (!syncResult || typeof syncResult.balance !== 'number') {
        continue;
      }

      await updateReadOnlyAccountBalance(userId, account.id, syncResult.balance, {
        label: 'Read-only live sync',
        message: syncResult.message || null,
      });
    } catch (error) {
      console.warn(`Read-only sync failed for account ${account?.id}:`, error?.message || error);
    }
  }
}
