const assert = require("node:assert/strict");
const test = require("node:test");
const { deleteConnectedAccount } = require("./src/deleteConnectedAccount");

function createDb(records) {
  const documents = new Map(Object.entries(records));
  const deleted = [];
  const db = {
    collection: (collection) => ({
      doc: (id) => ({ path: `${collection}/${id}` }),
      where: (field, operator, value) => ({ collection, field, value }),
    }),
    runTransaction: async (handler) => {
      const pending = [];
      await handler({
        get: async (ref) => ref.collection
          ? { docs: [...documents].filter(([path, data]) => path.startsWith(`${ref.collection}/`) && data[ref.field] === ref.value)
            .map(([path]) => ({ ref: { path } })) }
          : { exists: documents.has(ref.path), data: () => documents.get(ref.path) },
        delete: (ref) => pending.push(ref.path),
      });
      for (const path of pending) { documents.delete(path); deleted.push(path); }
    },
  };
  return { db, documents, deleted };
}

test("connected account deletion requires authentication and valid inputs", async () => {
  const { db } = createDb({});
  await assert.rejects(deleteConnectedAccount(db, {}), { code: "unauthenticated" });
  for (const data of [{ type: "bank", accountId: "id" }, { type: "crypto", accountId: "bad/path" }, { type: "investment", accountId: "" }]) {
    await assert.rejects(deleteConnectedAccount(db, { auth: { uid: "owner" }, data }), { code: "invalid-argument" });
  }
});

test("deletes investment data and credentials atomically and supports retries", async () => {
  const { db, documents } = createDb({
    "investmentAccounts/id": { userId: "owner", positions: [1] },
    "investmentAccountSecrets/id": { userId: "owner", encryptedApiKey: "ciphertext" },
    "investmentAccounts/other": { userId: "other" },
  });
  const request = { auth: { uid: "owner" }, data: { type: "investment", accountId: "id" } };
  assert.equal((await deleteConnectedAccount(db, request)).success, true);
  assert.equal((await deleteConnectedAccount(db, request)).success, true);
  assert.equal(documents.size, 1);
  assert(documents.has("investmentAccounts/other"));
});

test("rejects cross-user deletion including orphaned credentials", async () => {
  for (const records of [
    { "cryptoAccounts/id": { userId: "other" } },
    { "cryptoAccountSecrets/id": { userId: "other" } },
    { "cryptoAccounts/id": { userId: "owner" }, "cryptoAccountSecrets/id": { userId: "other" } },
  ]) {
    const { db, deleted } = createDb(records);
    await assert.rejects(deleteConnectedAccount(db, { auth: { uid: "owner" }, data: { type: "crypto", accountId: "id" } }), { code: "permission-denied" });
    assert.equal(deleted.length, 0);
  }
});

test("Coinbase deletion removes tokens and own OAuth states only", async () => {
  const { db, documents } = createDb({
    "cryptoAccounts/owner_coinbase": { userId: "owner", provider: "coinbase" },
    "cryptoAccountSecrets/owner_coinbase": { userId: "owner", encryptedTokens: "ciphertext" },
    "cryptoOAuthStates/own": { userId: "owner" },
    "cryptoOAuthStates/other": { userId: "other" },
    "cryptoAccounts/wallet": { userId: "owner", source: "wallet" },
  });
  await deleteConnectedAccount(db, { auth: { uid: "owner" }, data: { type: "crypto", accountId: "owner_coinbase" } });
  assert.deepEqual([...documents.keys()].sort(), ["cryptoAccounts/wallet", "cryptoOAuthStates/other"]);
});

test("self-custody deletion preserves pending Coinbase authorization", async () => {
  const { db, documents } = createDb({
    "cryptoAccounts/wallet": { userId: "owner", source: "wallet" },
    "cryptoOAuthStates/own": { userId: "owner" },
  });
  await deleteConnectedAccount(db, { auth: { uid: "owner" }, data: { type: "crypto", accountId: "wallet" } });
  assert.deepEqual([...documents.keys()], ["cryptoOAuthStates/own"]);
});