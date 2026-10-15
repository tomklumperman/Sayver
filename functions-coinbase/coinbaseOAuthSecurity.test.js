const assert = require("node:assert/strict");
const test = require("node:test");
const {
  COINBASE_OAUTH_CALLBACK_URI,
  isAllowedCoinbaseAppRedirect,
  parseAllowedAppRedirectUris,
  PRODUCTION_APP_REDIRECT_URI,
} = require("./src/providers/coinbaseOAuthSecurity");

test("server callback URL avoids Coinbase's rejected redirect substring", () => {
  assert.equal(COINBASE_OAUTH_CALLBACK_URI, "https://us-central1-finances-overview.cloudfunctions.net/oauthCallback");
  assert.equal(COINBASE_OAUTH_CALLBACK_URI.toLowerCase().includes("coinbase"), false);
});

test("allows the fixed production app redirect by default", () => {
  const allowed = parseAllowedAppRedirectUris();
  assert.equal(isAllowedCoinbaseAppRedirect(PRODUCTION_APP_REDIRECT_URI, allowed), true);
});

test("allows an exact configured development redirect", () => {
  const developmentUri = "exp://192.168.1.25:8081/--/coinbase-connected";
  const allowed = parseAllowedAppRedirectUris(`${PRODUCTION_APP_REDIRECT_URI},${developmentUri}`);
  assert.equal(isAllowedCoinbaseAppRedirect(developmentUri, allowed), true);
  assert.equal(isAllowedCoinbaseAppRedirect("exp://192.168.1.26:8081/--/coinbase-connected", allowed), false);
});

test("rejects unconfigured Expo hosts, wildcards, query strings and credentials", () => {
  const allowed = parseAllowedAppRedirectUris();
  assert.equal(isAllowedCoinbaseAppRedirect("exp://arbitrary.exp.host/--/coinbase-connected", allowed), false);
  assert.equal(isAllowedCoinbaseAppRedirect("exps://attacker.example/--/coinbase-connected", allowed), false);
  assert.equal(isAllowedCoinbaseAppRedirect("https://*.expo.dev/--/coinbase-connected", allowed), false);
  assert.equal(isAllowedCoinbaseAppRedirect("sayver://coinbase-connected?next=https://attacker.invalid", allowed), false);
  assert.equal(isAllowedCoinbaseAppRedirect("sayver://user:pass@coinbase-connected", allowed), false);
});