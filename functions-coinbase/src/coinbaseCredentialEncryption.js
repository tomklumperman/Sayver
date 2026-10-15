const { decryptCredential, encryptCredential } = require("./credentialsEncryption");

const COINBASE_ENCRYPTION_VERSION = 2;

function encryptCoinbaseCredential(value, keyHex) {
  return {
    encryptedValue: encryptCredential(value, keyHex),
    encryptionVersion: COINBASE_ENCRYPTION_VERSION,
  };
}

function decryptCoinbaseCredential(encryptedValue, encryptionVersion, coinbaseKeyHex, legacyKeyHex) {
  if (encryptionVersion === COINBASE_ENCRYPTION_VERSION) {
    return {
      value: decryptCredential(encryptedValue, coinbaseKeyHex),
      needsMigration: false,
    };
  }

  if (encryptionVersion == null) {
    return {
      value: decryptCredential(encryptedValue, legacyKeyHex),
      needsMigration: true,
    };
  }

  throw new Error("Unsupported Coinbase credential encryption version.");
}

module.exports = {
  decryptCoinbaseCredential,
  encryptCoinbaseCredential,
  COINBASE_ENCRYPTION_VERSION,
};