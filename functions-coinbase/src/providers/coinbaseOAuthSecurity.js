const PRODUCTION_APP_REDIRECT_URI = "sayver://coinbase-connected";
const COINBASE_OAUTH_CALLBACK_URI = "https://us-central1-finances-overview.cloudfunctions.net/oauthCallback";

function parseAllowedAppRedirectUris(configuredUris = "") {
  const configured = String(configuredUris || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([PRODUCTION_APP_REDIRECT_URI, ...configured]);
}

function isAllowedCoinbaseAppRedirect(value, allowedUris) {
  if (typeof value !== "string" || !allowedUris?.has(value)) return false;
  try {
    const redirect = new URL(value);
    if (redirect.username || redirect.password || redirect.search || redirect.hash) return false;
    if (redirect.protocol === "sayver:") {
      return redirect.hostname === "coinbase-connected" && !redirect.pathname;
    }
    return ["exp:", "exps:"].includes(redirect.protocol)
      && redirect.pathname.endsWith("/--/coinbase-connected");
  } catch (_error) {
    return false;
  }
}

module.exports = {
  COINBASE_OAUTH_CALLBACK_URI,
  PRODUCTION_APP_REDIRECT_URI,
  isAllowedCoinbaseAppRedirect,
  parseAllowedAppRedirectUris,
};