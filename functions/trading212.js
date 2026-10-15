const {
  Trading212Provider,
  mapTrading212AccountSummary,
  mapTrading212Positions,
} = require("./src/providers/trading212Provider");

const provider = new Trading212Provider();

function fetchTrading212AccountSummary(apiKey, apiSecret) {
  return provider.getAccountSummary(apiKey, apiSecret);
}

module.exports = {
  Trading212Provider,
  fetchTrading212AccountSummary,
  mapTrading212AccountSummary,
  mapTrading212Positions,
};
