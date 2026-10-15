const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  Trading212Provider,
  mapTrading212AccountSummary,
  mapTrading212Positions,
} = require("./trading212");
const { encryptCredential, decryptCredential } = require("./src/credentialsEncryption");
const { deleteConnectedAccount } = require("./src/deleteConnectedAccount");
const { createAlchemyCryptoWalletProvider, getWalletNetwork, isValidPublicAddress, WalletProviderAccessError } = require("./src/providers/cryptoWalletProvider");

initializeApp();
const db = getFirestore();
const trading212Provider = new Trading212Provider();

setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// Generate with `openssl rand -hex 32`, then: firebase functions:secrets:set ENCRYPTION_KEY
const encryptionKey = defineSecret("ENCRYPTION_KEY");
const alchemyApiKey = defineSecret("ALCHEMY_API_KEY");

exports.deleteConnectedAccount = onCall((request) => deleteConnectedAccount(db, request));

function createCryptoAccountId(userId, network, address) {
  const addressHash = createHash("sha256").update(address).digest("hex").slice(0, 32);
  return `${userId}_${network}_${addressHash}`;
}

async function syncOneCryptoWallet(accountRef, accountData, provider) {
  try {
    const balances = await provider.getBalances(accountData.network, accountData.publicAddress);
    await accountRef.update({
      balances,
      syncStatus: "ok",
      lastSyncFailed: false,
      lastSyncError: null,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (_error) {
    await accountRef.update({
      syncStatus: "error",
      lastSyncFailed: true,
      lastSyncError: "Unable to refresh this crypto wallet.",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  }
}

exports.connectCryptoWallet = onCall({ secrets: [alchemyApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

  const networkId = typeof request.data?.network === "string" ? request.data.network.toLowerCase() : "";
  const address = typeof request.data?.publicAddress === "string" ? request.data.publicAddress.trim() : "";
  const network = getWalletNetwork(networkId);
  if (!network) throw new HttpsError("invalid-argument", "Select a supported network.");
  if (!isValidPublicAddress(networkId, address)) {
    throw new HttpsError("invalid-argument", "Enter a valid public wallet address for this network.");
  }

  const normalizedAddress = network.kind === "evm" ? address.toLowerCase() : address;
  const provider = createAlchemyCryptoWalletProvider({ apiKey: alchemyApiKey.value() });
  let balances;
  try {
    balances = await provider.getBalances(networkId, normalizedAddress);
  } catch (error) {
    if (error instanceof WalletProviderAccessError) {
      console.error("Alchemy wallet network access denied.", {
        network: error.network,
        method: error.method,
        httpStatus: error.httpStatus,
      });
      throw new HttpsError("failed-precondition", error.message);
    }
    console.error("Crypto wallet connect failed during initial sync.");
    throw new HttpsError("unavailable", "Could not load this wallet's balances. Check the address or try again.");
  }

  const accountId = createCryptoAccountId(request.auth.uid, networkId, normalizedAddress);
  await db.collection("cryptoAccounts").doc(accountId).set({
    userId: request.auth.uid,
    type: "crypto",
    source: "wallet",
    provider: "alchemy",
    network: networkId,
    networkName: network.name,
    publicAddress: normalizedAddress,
    balances,
    syncStatus: "ok",
    lastSyncFailed: false,
    lastSyncError: null,
    lastSyncedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true, accountId };
});

exports.purgeLegacyCryptoCredentials = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const userId = request.auth.uid;
  const accounts = await db.collection("users").doc(userId).collection("accounts").get();
  const legacyCryptoAccounts = accounts.docs.filter((accountDoc) => (
    String(accountDoc.data()?.type || "").toLowerCase() === "crypto"
      && accountDoc.data()?.readOnlyConfig?.enabled === true
  ));

  await Promise.all(legacyCryptoAccounts.map((accountDoc) => accountDoc.ref.update({
    "readOnlyConfig.enabled": false,
    "readOnlyConfig.provider": FieldValue.delete(),
    "readOnlyConfig.externalAccountRef": FieldValue.delete(),
    "readOnlyConfig.connectorEndpoint": FieldValue.delete(),
    "readOnlyConfig.walletAddress": FieldValue.delete(),
    "readOnlyConfig.walletChain": FieldValue.delete(),
    "readOnlyConfig.apiKey": FieldValue.delete(),
    "readOnlyConfig.apiSecret": FieldValue.delete(),
    "readOnlyConfig.apiPassphrase": FieldValue.delete(),
    "readOnlyConfig.integrationMode": FieldValue.delete(),
    "readOnlyConfig.note": "Legacy client-side crypto connectors disabled; reconnect with the secure crypto flow.",
    apiKey: FieldValue.delete(),
    apiSecret: FieldValue.delete(),
    apiPassphrase: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  })));

  return { success: true, cleanedCount: legacyCryptoAccounts.length };
});

exports.syncCryptoWalletsOnDemand = onCall({ secrets: [alchemyApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

  const snapshot = await db.collection("cryptoAccounts")
    .where("userId", "==", request.auth.uid)
    .get();
  const provider = createAlchemyCryptoWalletProvider({ apiKey: alchemyApiKey.value() });
  const walletDocs = snapshot.docs.filter((accountDoc) => accountDoc.data()?.source === "wallet");
  const results = await Promise.all(walletDocs.map((accountDoc) => (
    syncOneCryptoWallet(accountDoc.ref, accountDoc.data(), provider)
  )));
  const syncedCount = results.filter(Boolean).length;
  return { success: syncedCount === results.length, syncedCount, failedCount: results.length - syncedCount };
});

async function syncOneInvestmentAccount(accountId, keyHex) {
  try {
    const secretDoc = await db.collection("investmentAccountSecrets").doc(accountId).get();
    if (!secretDoc.exists) {
      await db.collection("investmentAccounts").doc(accountId).update({
        lastSyncFailed: true,
        lastSyncError: "Saved credentials are missing; reconnect required.",
      });
      return false;
    }

    const { encryptedApiKey, encryptedApiSecret } = secretDoc.data();
    console.info("Trading212 sync flow", { stage: "encrypted-credentials-loaded", status: "success" });
    const apiKey = decryptCredential(encryptedApiKey, keyHex);
    const apiSecret = decryptCredential(encryptedApiSecret, keyHex);
    console.info("Trading212 sync flow", { stage: "credential-decryption", status: "success" });
    const response = await trading212Provider.getAccountSummary(apiKey, apiSecret);
    console.info("Trading212 API response", { flow: "sync", endpoint: "account-summary", status: response.status });

    if ([401, 403].includes(response.status)) {
      await db.collection("investmentAccounts").doc(accountId).update({
        status: "invalid",
        lastSyncFailed: true,
        lastSyncError: "Credentials revoked or expired — reconnect required.",
      });
      return false;
    }
    if (!response.ok) {
      throw new Error("Trading 212 sync request failed.");
    }

    const summaryPayload = await response.json();
    const { cashBalance, investedValue, totalCost, unrealizedProfitLoss, totalValue, currency } = mapTrading212AccountSummary(summaryPayload);
    const positionsResponse = await trading212Provider.getPositions(apiKey, apiSecret);
    console.info("Trading212 API response", { flow: "sync", endpoint: "positions", status: positionsResponse.status });
    const positionsPayload = positionsResponse.ok ? await positionsResponse.json() : null;
    const positions = positionsResponse.ok ? mapTrading212Positions(positionsPayload) : null;

    await db.collection("investmentAccounts").doc(accountId).update({
      cashBalance,
      investedValue,
      totalCost,
      unrealizedProfitLoss,
      totalValue,
      ...(positions ? { positions } : {}),
      ...(currency ? { currency } : {}),
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastSyncFailed: false,
      lastSyncError: positionsResponse.ok ? null : "Portfolio permissions unavailable; balance refreshed.",
    });
    return true;
  } catch (error) {
    console.error(`Trading212 sync failed for ${accountId}.`);
    // Transient failure — keep the last good cached balances, just record the error.
    await db.collection("investmentAccounts").doc(accountId).update({
      lastSyncFailed: true,
      lastSyncError: "Unable to refresh Trading 212 account data.",
    });
    return false;
  }
}

// ── Connect flow: validate credentials, encrypt + store them, save initial balances ──
exports.connectTrading212 = onCall({ secrets: [encryptionKey] }, async (request) => {
  console.info('Trading212 connect flow', { stage: 'callable-entered' });
  if (!request.auth) {
    console.warn('Trading212 connect flow', { stage: 'authentication', status: 'unauthenticated' });
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  console.info('Trading212 connect flow', { stage: 'authentication', status: 'authenticated' });

  const apiKey = typeof request.data?.apiKey === "string" ? request.data.apiKey : "";
  const apiSecret = typeof request.data?.apiSecret === "string" ? request.data.apiSecret : "";
  if (!apiKey.trim() || !apiSecret.trim()) {
    console.warn('Trading212 connect flow', { stage: 'input-validation', status: 'missing-credentials' });
    throw new HttpsError("invalid-argument", "API key and secret are required.");
  }
  console.info('Trading212 connect flow', { stage: 'input-validation', status: 'credentials-present' });

  let cashPayload;
  let positionsPayload;
  try {
    console.info("Trading212 API request", { flow: "connect", endpoint: "account-summary" });
    const response = await trading212Provider.getAccountSummary(apiKey, apiSecret);
    console.info("Trading212 API response", { flow: "connect", endpoint: "account-summary", status: response.status });
    if ([401, 403].includes(response.status)) {
      throw new HttpsError("permission-denied", "Trading 212 credentials are invalid or missing read-only permissions.");
    }
    if (!response.ok) {
      throw new HttpsError("unavailable", "Trading 212 could not provide account data.");
    }
    cashPayload = await response.json();
    console.info('Trading212 connect flow', { stage: 'account-summary-parse', status: 'success' });

    console.info("Trading212 API request", { flow: "connect", endpoint: "positions" });
    const positionsResponse = await trading212Provider.getPositions(apiKey, apiSecret);
    console.info("Trading212 API response", { flow: "connect", endpoint: "positions", status: positionsResponse.status });
    positionsPayload = positionsResponse.ok ? await positionsResponse.json() : null;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Trading212 account-summary request failed.");
    throw new HttpsError("unavailable", "Could not reach Trading212. Please try again.");
  }

  const { cashBalance, investedValue, totalCost, unrealizedProfitLoss, totalValue, currency } = mapTrading212AccountSummary(cashPayload);
  const positions = mapTrading212Positions(positionsPayload);
  const positionsUnavailable = !Array.isArray(positionsPayload);
  const keyHex = encryptionKey.value();
  console.info('Trading212 connect flow', { stage: 'credential-encryption', status: 'started' });
  const encryptedApiKey = encryptCredential(apiKey, keyHex);
  const encryptedApiSecret = encryptCredential(apiSecret, keyHex);
  console.info('Trading212 connect flow', { stage: 'credential-encryption', status: 'success' });

  const userId = request.auth.uid;
  const accountId = `${userId}_trading212`;

  await db.collection("investmentAccounts").doc(accountId).set({
    userId,
    broker: "trading212",
    status: "active",
    currency,
    cashBalance,
    investedValue,
    totalCost,
    unrealizedProfitLoss,
    totalValue,
    positions,
    lastSyncedAt: FieldValue.serverTimestamp(),
    lastSyncFailed: false,
    lastSyncError: positionsUnavailable ? "Portfolio permissions unavailable; balance connected." : null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Secrets live in a separate collection with zero client read/write access.
  try {
    await db.collection("investmentAccountSecrets").doc(accountId).set({
      userId,
      encryptedApiKey,
      encryptedApiSecret,
    });
  } catch (_error) {
    console.error('Trading212 connect flow', { stage: 'credential-persistence', status: 'failed' });
    throw new HttpsError("internal", "Could not securely save this Trading 212 connection.");
  }

  console.info('Trading212 connect flow', { stage: 'persistence', status: 'success' });
  return { success: true, accountId };
});

// ── On-demand sync: pull-to-refresh triggers this for the calling user only ──────
exports.syncInvestmentBalancesOnDemand = onCall({ secrets: [encryptionKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const snapshot = await db.collection("investmentAccounts")
    .where("userId", "==", request.auth.uid)
    .where("status", "==", "active")
    .get();

  const keyHex = encryptionKey.value();
  const syncResults = await Promise.all(snapshot.docs.map((docItem) => syncOneInvestmentAccount(docItem.id, keyHex)));
  const syncedCount = syncResults.filter(Boolean).length;
  const failedCount = syncResults.length - syncedCount;

  return { success: failedCount === 0, syncedCount, failedCount };
});

// ── Background sync: refresh all active accounts periodically ───────────────────
exports.scheduledSyncInvestmentBalances = onSchedule(
  { schedule: "every 4 hours", secrets: [encryptionKey] },
  async () => {
    const snapshot = await db.collection("investmentAccounts").where("status", "==", "active").get();
    const keyHex = encryptionKey.value();

    // Trading212 rate limits are low — sync sequentially rather than in parallel.
    // Check current limits at docs.trading212.com before increasing account volume.
    for (const docItem of snapshot.docs) {
      await syncOneInvestmentAccount(docItem.id, keyHex);
    }
  }
);
