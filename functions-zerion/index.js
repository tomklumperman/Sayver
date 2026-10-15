const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const zerionApiKey = defineSecret("ZERION_API_KEY");

exports.syncWalletBalance = onCall({ secrets: [zerionApiKey], region: "us-central1", maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const { walletAddress, accountId } = request.data;
  const userId = request.auth.uid;

  if (!walletAddress || !accountId) {
    throw new HttpsError("invalid-argument", "walletAddress and accountId are required.");
  }

  try {
    const response = await fetch(
      `https://api.zerion.io/v1/wallets/${walletAddress}/portfolio?currency=usd`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${zerionApiKey.value()}:`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      },
    );

    const json = await response.json();
    const totalValue = json?.data?.attributes?.total?.positions ?? 0;

    await db
      .collection("users")
      .doc(userId)
      .collection("accounts")
      .doc(accountId)
      .update({
        linkedBalance: totalValue,
        lastSynced: FieldValue.serverTimestamp(),
        readOnly: true,
      });

    return { success: true, balance: totalValue };
  } catch (_error) {
    console.error("Wallet sync failed during provider request or account update.");
    throw new HttpsError("internal", "Failed to sync wallet balance.");
  }
});