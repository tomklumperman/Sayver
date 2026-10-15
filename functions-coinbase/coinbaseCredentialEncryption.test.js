const assert = require("node:assert/strict");
const test = require("node:test");
const { encryptCredential } = require("./src/credentialsEncryption");
const {
  decryptCoinbaseCredential,
  encryptCoinbaseCredential,
  COINBASE_ENCRYPTION_VERSION,
} = require("./src/coinbaseCredentialEncryption");

test("Coinbase credentials use their independent encryption key", () => {
  const trading212Key = "11".repeat(32);
  const coinbaseKey = "22".repeat(32);
  const encrypted = encryptCoinbaseCredential("coinbase-token", coinbaseKey);

  assert.equal(encrypted.encryptionVersion, COINBASE_ENCRYPTION_VERSION);
  assert.equal(
    decryptCoinbaseCredential(encrypted.encryptedValue, encrypted.encryptionVersion, coinbaseKey, trading212Key).value,
    "coinbase-token",
  );
  assert.throws(() => decryptCoinbaseCredential(
    encrypted.encryptedValue,
    encrypted.encryptionVersion,
    trading212Key,
    trading212Key,
  ));
});

test("legacy Coinbase ciphertext is readable with ENCRYPTION_KEY and migrates to the Coinbase key", () => {
  const trading212Key = "33".repeat(32);
  const coinbaseKey = "44".repeat(32);
  const legacyCiphertext = encryptCredential("legacy-coinbase-token", trading212Key);
  const legacy = decryptCoinbaseCredential(legacyCiphertext, undefined, coinbaseKey, trading212Key);
  const migrated = encryptCoinbaseCredential(legacy.value, coinbaseKey);

  assert.equal(legacy.needsMigration, true);
  assert.equal(migrated.encryptionVersion, COINBASE_ENCRYPTION_VERSION);
  assert.equal(
    decryptCoinbaseCredential(migrated.encryptedValue, migrated.encryptionVersion, coinbaseKey, trading212Key).value,
    "legacy-coinbase-token",
  );
});

test("unknown Coinbase encryption versions fail closed", () => {
  assert.throws(() => decryptCoinbaseCredential("ciphertext", 99, "22".repeat(32), "11".repeat(32)));
});