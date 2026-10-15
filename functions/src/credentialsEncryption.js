const crypto = require("crypto");

function getEncryptionKey(keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(keyHex || ""))) {
    throw new Error("Invalid server encryption key configuration.");
  }
  return Buffer.from(keyHex, "hex");
}

function encryptCredential(value, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function decryptCredential(encoded, keyHex) {
  const payload = Buffer.from(encoded, "base64");
  if (payload.length < 29) throw new Error("Invalid encrypted credential.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(keyHex), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

module.exports = { encryptCredential, decryptCredential };
