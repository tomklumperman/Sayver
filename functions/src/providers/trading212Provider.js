const fetch = require("node-fetch");

const API_BASE = "https://live.trading212.com/api/v0";

class Trading212Provider {
  async request(path, apiKey, apiSecret) {
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    try {
      return await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Basic ${basicAuth}` },
        timeout: 15000,
      });
    } catch (error) {
      console.warn("Trading212 provider request failed", {
        endpoint: path,
        status: error?.response?.status || "network-error",
      });
      throw error;
    }
  }

  getAccountSummary(apiKey, apiSecret) {
    return this.request("/equity/account/summary", apiKey, apiSecret);
  }

  getPositions(apiKey, apiSecret) {
    return this.request("/equity/positions", apiKey, apiSecret);
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapTrading212AccountSummary(payload) {
  const cash = payload?.cash || {};
  const investments = payload?.investments || {};
  const cashBalance = toNumber(cash.availableToTrade) + toNumber(cash.inPies) + toNumber(cash.reservedForOrders);
  const investedValue = toNumber(investments.currentValue);
  const totalCost = toNumber(investments.totalCost);
  const unrealizedProfitLoss = toNumber(investments.unrealizedProfitLoss);
  const documentedTotalValue = Number(payload?.totalValue);

  return {
    cashBalance,
    investedValue,
    totalCost,
    unrealizedProfitLoss,
    totalValue: Number.isFinite(documentedTotalValue) ? documentedTotalValue : cashBalance + investedValue,
    currency: payload?.currency || null,
  };
}

function mapTrading212Positions(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((position) => ({
    ticker: position?.instrument?.ticker || null,
    name: position?.instrument?.name || position?.instrument?.shortName || position?.instrument?.ticker || "Investment",
    quantity: toNumber(position?.quantity),
    currentPrice: toNumber(position?.currentPrice),
    currency: position?.instrument?.currency || null,
    valueCurrency: position?.walletImpact?.currency || null,
    currentValue: toNumber(position?.walletImpact?.currentValue),
  }));
}

module.exports = {
  Trading212Provider,
  mapTrading212AccountSummary,
  mapTrading212Positions,
};
