const { HttpsError } = require("firebase-functions/v2/https");

async function deleteConnectedAccount(db, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { accountId, type } = request.data || {};
  if (typeof accountId !== "string" || !accountId.trim() || accountId.includes("/")
    || accountId.length > 1500 || !["investment", "crypto"].includes(type)) {
    throw new HttpsError("invalid-argument", "A valid connected account ID and type are required.");
  }
  const userId = request.auth.uid;
  const collection = type === "investment" ? "investmentAccounts" : "cryptoAccounts";
  const accountRef = db.collection(collection).doc(accountId);
  const secretRef = db.collection(type === "investment" ? "investmentAccountSecrets" : "cryptoAccountSecrets").doc(accountId);

  await db.runTransaction(async (transaction) => {
    const account = await transaction.get(accountRef);
    const credentials = await transaction.get(secretRef);
    for (const snapshot of [account, credentials]) {
      if (snapshot.exists && snapshot.data().userId !== userId) {
        throw new HttpsError("permission-denied", "This account does not belong to you.");
      }
    }
    const isCoinbase = type === "crypto" && (
      account.data()?.provider === "coinbase" || accountId === `${userId}_coinbase`
    );
    const states = isCoinbase
      ? await transaction.get(db.collection("cryptoOAuthStates").where("userId", "==", userId))
      : null;
    transaction.delete(secretRef);
    transaction.delete(accountRef);
    for (const state of states?.docs || []) transaction.delete(state.ref);
  });

  return { success: true, accountId };
}

module.exports = { deleteConnectedAccount };