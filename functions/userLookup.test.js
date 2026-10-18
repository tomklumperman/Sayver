const assert = require("node:assert/strict");
const test = require("node:test");
const { lookupCollaboratorByEmail } = require("./src/userLookup");

test("returns only the profile fields required to invite a collaborator", async () => {
  const result = await lookupCollaboratorByEmail({
    getUserByEmail: async (email) => {
      assert.equal(email, "invitee@example.test");
      return {
        uid: "invitee-uid",
        email,
        displayName: "Invitee",
        photoURL: "private-photo-url",
        customClaims: { admin: true },
      };
    },
  }, "invitee@example.test");

  assert.deepEqual(result, {
    uid: "invitee-uid",
    email: "invitee@example.test",
    displayName: "Invitee",
  });
});

test("returns null when no Firebase Auth user matches the invite email", async () => {
  const result = await lookupCollaboratorByEmail({
    getUserByEmail: async () => {
      const error = new Error("User not found");
      error.code = "auth/user-not-found";
      throw error;
    },
  }, "missing@example.test");

  assert.equal(result, null);
});

test("propagates unexpected Firebase Auth lookup errors", async () => {
  await assert.rejects(
    lookupCollaboratorByEmail({ getUserByEmail: async () => { throw new Error("service unavailable"); } }, "invitee@example.test"),
    /service unavailable/,
  );
});