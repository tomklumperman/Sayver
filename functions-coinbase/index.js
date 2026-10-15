const { setGlobalOptions } = require("firebase-functions");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { createHash, randomBytes } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { decryptCoinbaseCredential, encryptCoinbaseCredential } = require("./src/coinbaseCredentialEncryption");
const { assertCoinbaseReadOnlyScopes, createCoinbaseExchangeProvider } = require("./src/providers/coinbaseProvider");
const { COINBASE_OAUTH_CALLBACK_URI, isAllowedCoinbaseAppRedirect, parseAllowedAppRedirectUris, PRODUCTION_APP_REDIRECT_URI } = require("./src/providers/coinbaseOAuthSecurity");
const { decryptCredential } = require("./src/credentialsEncryption");

initializeApp();
const db = getFirestore();

setGlobalOptions({ maxInstances: 10, region: "us-central1" });

const encryptionKey = defineSecret("ENCRYPTION_KEY");
const coinbaseEncryptionKey = defineSecret("COINBASE_ENCRYPTION_KEY");
const coinbaseClientId = defineSecret("COINBASE_OAUTH_CLIENT_ID");
const coinbaseClientSecret = defineSecret("COINBASE_OAUTH_CLIENT_SECRET");
const coinbaseAllowedAppRedirectUris = defineString("COINBASE_ALLOWED_APP_REDIRECT_URIS", { default: PRODUCTION_APP_REDIRECT_URI });
const COINBASE_APP_SCOPES = "wallet:accounts:read,offline_access";

function getAllowedCoinbaseAppRedirectUris() {
  return parseAllowedAppRedirectUris(coinbaseAllowedAppRedirectUris.value());
}

function createCoinbaseAppRedirect(value, status) {
  const redirect = new URL(value);
  redirect.searchParams.set("coinbase", status);
  return redirect.toString();
}

async function requestCoinbaseToken(formData, clientId, clientSecret) {
  const response = await fetch("https://login.coinbase.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...formData, client_id: clientId, client_secret: clientSecret }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) throw new Error("Coinbase OAuth token exchange failed.");
  return payload;
}

function encodeCoinbaseTokenBundle(tokenResponse, previousBundle = null) {
  const expiresIn = Number(tokenResponse.expires_in) || 3600;
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token || previousBundle?.refreshToken || null,
    expiresAt: Date.now() + (expiresIn * 1000),
  };
}

async function getCoinbaseAccessToken(accountId, accountData, coinbaseKeyHex, legacyKeyHex, clientId, clientSecret) {
  const secretRef = db.collection("cryptoAccountSecrets").doc(accountId);
  const secretSnapshot = await secretRef.get();
  if (!secretSnapshot.exists || secretSnapshot.data()?.userId !== accountData.userId) {
    throw new Error("Coinbase credentials unavailable.");
  }

  let tokenBundle;
  let needsEncryptionMigration;
  try {
    const decrypted = decryptCoinbaseCredential(
      secretSnapshot.data().encryptedTokens,
      secretSnapshot.data().encryptionVersion,
      coinbaseKeyHex,
      legacyKeyHex,
    );
    tokenBundle = JSON.parse(decrypted.value);
    needsEncryptionMigration = decrypted.needsMigration;
  } catch (_error) {
    throw new Error("Coinbase credentials unavailable.");
  }
  if (needsEncryptionMigration) {
    const encrypted = encryptCoinbaseCredential(JSON.stringify(tokenBundle), coinbaseKeyHex);
    await secretRef.update({
      encryptedTokens: encrypted.encryptedValue,
      encryptionVersion: encrypted.encryptionVersion,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (tokenBundle.expiresAt > Date.now() + 60000) return tokenBundle.accessToken;
  if (!tokenBundle.refreshToken) throw new Error("Coinbase authorization expired; reconnect required.");

  const refreshed = await requestCoinbaseToken({
    grant_type: "refresh_token",
    refresh_token: tokenBundle.refreshToken,
  }, clientId, clientSecret);
  tokenBundle = encodeCoinbaseTokenBundle(refreshed, tokenBundle);
  const encrypted = encryptCoinbaseCredential(JSON.stringify(tokenBundle), coinbaseKeyHex);
  await secretRef.update({
    userId: accountData.userId,
    encryptedTokens: encrypted.encryptedValue,
    encryptionVersion: encrypted.encryptionVersion,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return tokenBundle.accessToken;
}

async function syncOneCoinbaseAccount(accountDoc, coinbaseKeyHex, legacyKeyHex, clientId, clientSecret) {
  const accountData = accountDoc.data();
  try {
    const accessToken = await getCoinbaseAccessToken(accountDoc.id, accountData, coinbaseKeyHex, legacyKeyHex, clientId, clientSecret);
    const balances = await createCoinbaseExchangeProvider().getBalances(accessToken);
    await accountDoc.ref.update({
      balances,
      syncStatus: "ok",
      lastSyncFailed: false,
      lastSyncError: null,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (_error) {
    await accountDoc.ref.update({
      syncStatus: "error",
      lastSyncFailed: true,
      lastSyncError: "Unable to refresh Coinbase account data.",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  }
}

async function persistCoinbaseAccount(userId, tokenResponse, coinbaseKeyHex, legacyKeyHex, clientId, clientSecret) {
  const tokenBundle = encodeCoinbaseTokenBundle(tokenResponse);
  const accountId = `${userId}_coinbase`;
  const secretRef = db.collection("cryptoAccountSecrets").doc(accountId);
  const encrypted = encryptCoinbaseCredential(JSON.stringify(tokenBundle), coinbaseKeyHex);
  await secretRef.set({
    userId,
    encryptedTokens: encrypted.encryptedValue,
    encryptionVersion: encrypted.encryptionVersion,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const accountRef = db.collection("cryptoAccounts").doc(accountId);
  const accountData = {
    userId,
    type: "crypto",
    source: "exchange",
    provider: "coinbase",
    exchangeAccountIdentifier: "coinbase",
    network: null,
    networkName: "Coinbase",
    publicAddress: null,
  };
  const accessToken = await getCoinbaseAccessToken(accountId, accountData, coinbaseKeyHex, legacyKeyHex, clientId, clientSecret);
  try {
    const balances = await createCoinbaseExchangeProvider().getBalances(accessToken);
    await accountRef.set({
      ...accountData,
      balances,
      syncStatus: "ok",
      lastSyncFailed: false,
      lastSyncError: null,
      lastSyncedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (_error) {
    await accountRef.set({
      ...accountData,
      balances: [],
      syncStatus: "error",
      lastSyncFailed: true,
      lastSyncError: "Unable to load Coinbase account balances.",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return accountId;
}

exports.beginCoinbaseOAuth = onCall({ secrets: [coinbaseEncryptionKey, coinbaseClientId] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  if (!coinbaseClientId.value()) {
    throw new HttpsError("failed-precondition", "Coinbase OAuth is not configured for this app yet.");
  }
  const appRedirectUri = typeof request.data?.appRedirectUri === "string" ? request.data.appRedirectUri : "";
  if (!isAllowedCoinbaseAppRedirect(appRedirectUri, getAllowedCoinbaseAppRedirectUris())) {
    throw new HttpsError("invalid-argument", "Invalid Sayver OAuth return address.");
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const encryptedVerifier = encryptCoinbaseCredential(codeVerifier, coinbaseEncryptionKey.value());
  await db.collection("cryptoOAuthStates").doc(state).set({
    userId: request.auth.uid,
    appRedirectUri,
    encryptedCodeVerifier: encryptedVerifier.encryptedValue,
    encryptionVersion: encryptedVerifier.encryptionVersion,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: FieldValue.serverTimestamp(),
  });

  const authorizeUrl = new URL("https://login.coinbase.com/oauth2/auth");
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: coinbaseClientId.value(),
    redirect_uri: COINBASE_OAUTH_CALLBACK_URI,
    scope: COINBASE_APP_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: authorizeUrl.toString() };
});

async function handleCoinbaseOAuthCallback(request, response) {
  const state = typeof request.query?.state === "string" ? request.query.state : "";
  const code = typeof request.query?.code === "string" ? request.query.code : "";
  if (!state) {
    response.status(400).send("Invalid OAuth response.");
    return;
  }

  let appRedirectUri = null;
  try {
    const stateRef = db.collection("cryptoOAuthStates").doc(state);
    let stateData = null;
    await db.runTransaction(async (transaction) => {
      const stateSnapshot = await transaction.get(stateRef);
      if (!stateSnapshot.exists) throw new Error("Invalid or expired OAuth state.");
      const data = stateSnapshot.data();
      const expiryDate = typeof data.expiresAt?.toDate === "function"
        ? data.expiresAt.toDate()
        : new Date(data.expiresAt);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
        transaction.delete(stateRef);
        return;
      }
      stateData = data;
      transaction.delete(stateRef);
    });

    if (!stateData) throw new Error("Invalid or expired OAuth state.");
    appRedirectUri = stateData?.appRedirectUri || null;
    if (!isAllowedCoinbaseAppRedirect(appRedirectUri, getAllowedCoinbaseAppRedirectUris())) throw new Error("Invalid OAuth return address.");
    if (request.query?.error || !code) {
      response.redirect(302, createCoinbaseAppRedirect(appRedirectUri, "error"));
      return;
    }

    const { value: codeVerifier } = decryptCoinbaseCredential(
      stateData.encryptedCodeVerifier,
      stateData.encryptionVersion,
      coinbaseEncryptionKey.value(),
      encryptionKey.value(),
    );
    const tokenResponse = await requestCoinbaseToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: COINBASE_OAUTH_CALLBACK_URI,
      code_verifier: codeVerifier,
    }, coinbaseClientId.value(), coinbaseClientSecret.value());
    assertCoinbaseReadOnlyScopes(tokenResponse);
    await persistCoinbaseAccount(stateData.userId, tokenResponse, coinbaseEncryptionKey.value(), encryptionKey.value(), coinbaseClientId.value(), coinbaseClientSecret.value());
    response.redirect(302, createCoinbaseAppRedirect(appRedirectUri, "success"));
  } catch (_error) {
    if (appRedirectUri && isAllowedCoinbaseAppRedirect(appRedirectUri, getAllowedCoinbaseAppRedirectUris())) {
      response.redirect(302, createCoinbaseAppRedirect(appRedirectUri, "error"));
      return;
    }
    response.status(400).send("Could not complete Coinbase authorization.");
  }
}

const coinbaseOAuthCallbackOptions = { secrets: [coinbaseEncryptionKey, encryptionKey, coinbaseClientId, coinbaseClientSecret] };
exports.oauthCallback = onRequest(coinbaseOAuthCallbackOptions, handleCoinbaseOAuthCallback);
exports.coinbaseOAuthCallback = onRequest(coinbaseOAuthCallbackOptions, handleCoinbaseOAuthCallback);

exports.syncCoinbaseAccountsOnDemand = onCall({ secrets: [coinbaseEncryptionKey, encryptionKey, coinbaseClientId, coinbaseClientSecret] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const snapshot = await db.collection("cryptoAccounts").where("userId", "==", request.auth.uid).get();
  const coinbaseDocs = snapshot.docs.filter((accountDoc) => (
    accountDoc.data()?.source === "exchange" && accountDoc.data()?.provider === "coinbase"
  ));
  const results = await Promise.all(coinbaseDocs.map((accountDoc) => (
    syncOneCoinbaseAccount(accountDoc, coinbaseEncryptionKey.value(), encryptionKey.value(), coinbaseClientId.value(), coinbaseClientSecret.value())
  )));
  const syncedCount = results.filter(Boolean).length;
  return { success: syncedCount === results.length, syncedCount, failedCount: results.length - syncedCount };
});