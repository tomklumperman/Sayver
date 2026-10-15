const assert = require("node:assert/strict");
const test = require("node:test");
const { mapTrading212AccountSummary, mapTrading212Positions } = require("./trading212");
const { decryptCredential, encryptCredential } = require("./src/credentialsEncryption");

test("maps the documented Trading 212 account summary", () => {
  const result = mapTrading212AccountSummary({
    cash: {
      availableToTrade: 100,
      inPies: 25,
      reservedForOrders: 5,
    },
    investments: {
      currentValue: 870,
      totalCost: 800,
      unrealizedProfitLoss: 70,
    },
    totalValue: 1000,
    currency: "EUR",
  });

  assert.deepEqual(result, {
    cashBalance: 130,
    investedValue: 870,
    totalCost: 800,
    unrealizedProfitLoss: 70,
    totalValue: 1000,
    currency: "EUR",
  });
});

test("maps Trading 212 positions without retaining provider payloads", () => {
  const result = mapTrading212Positions([{
    instrument: { ticker: "AAPL_US_EQ", name: "Apple", currency: "USD" },
    quantity: 2,
    currentPrice: 190,
    walletImpact: { currentValue: 380, currency: "EUR" },
  }]);

  assert.deepEqual(result, [{
    ticker: "AAPL_US_EQ",
    name: "Apple",
    quantity: 2,
    currentPrice: 190,
    currency: "USD",
    valueCurrency: "EUR",
    currentValue: 380,
  }]);
});

test("Trading 212 credentials remain readable only with the existing ENCRYPTION_KEY", () => {
  const key = "ab".repeat(32);
  const secret = "user-provided-secret";
  const encrypted = encryptCredential(secret, key);

  assert.notEqual(encrypted, secret);
  assert.equal(decryptCredential(encrypted, key), secret);
  assert.throws(() => decryptCredential(encrypted, "cd".repeat(32)));
});
