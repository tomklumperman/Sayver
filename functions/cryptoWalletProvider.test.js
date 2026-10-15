const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAlchemyCryptoWalletProvider,
  formatUnits,
  isFungibleSolanaAsset,
  isValidPublicAddress,
  WalletProviderAccessError,
} = require("./src/providers/cryptoWalletProvider");

const EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOLANA_ADDRESS = "GwsPP9HHhCvEQeu3HTFzsVL6DEtnnYw4ALEtA3fMBC9Q";

function jsonResponse(result) {
  return { ok: true, json: async () => ({ result }) };
}

test("validates supported public wallet addresses only", () => {
  assert.equal(isValidPublicAddress("ethereum", EVM_ADDRESS), true);
  assert.equal(isValidPublicAddress("base", EVM_ADDRESS), true);
  assert.equal(isValidPublicAddress("ethereum", "0x1234"), false);
  assert.equal(isValidPublicAddress("bitcoin", EVM_ADDRESS), false);
  assert.equal(isValidPublicAddress("solana", SOLANA_ADDRESS), true);
  assert.equal(isValidPublicAddress("solana", "not-a-wallet"), false);
});

test("formats base-unit balances without floating point rounding", () => {
  assert.equal(formatUnits("123450000", 6), "123.45");
  assert.equal(formatUnits("1000000000000000000", 18), "1");
  assert.equal(formatUnits("1", 9), "0.000000001");
});

test("classifies fungible assets without accepting NFTs", () => {
  assert.equal(isFungibleSolanaAsset({ interface: "FungibleToken" }), true);
  assert.equal(isFungibleSolanaAsset({ token_info: { token_type: "fungible" } }), true);
  assert.equal(isFungibleSolanaAsset({ interface: "Custom", token_info: { decimals: 6 } }), true);
  assert.equal(isFungibleSolanaAsset(null, 9), true);
  assert.equal(isFungibleSolanaAsset({ interface: "V1_NFT" }), false);
  assert.equal(isFungibleSolanaAsset({ interface: "ProgrammableNFT", token_info: { decimals: 0 } }), false);
  assert.equal(isFungibleSolanaAsset({ interface: "Custom", token_info: { decimals: 0 } }), false);
  assert.equal(isFungibleSolanaAsset({}), false);
});

test("fetches all paginated non-zero ERC-20 balances plus native ETH", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body);
    calls.push({ url, request });
    if (request.method === "alchemy_getTokenBalances" && request.params[2]?.pageKey === "next") {
      return jsonResponse({ tokenBalances: [{ contractAddress: "0x0000000000000000000000000000000000000002", tokenBalance: "0x00" }] });
    }
    if (request.method === "alchemy_getTokenBalances") {
      return jsonResponse({
        tokenBalances: [
          { contractAddress: "0x0000000000000000000000000000000000000001", tokenBalance: `0x${BigInt(123450000).toString(16)}` },
        ],
        pageKey: "next",
      });
    }
    if (request.method === "alchemy_getTokenMetadata") {
      return jsonResponse({ name: "Example Dollar", symbol: "EXD", decimals: 6 });
    }
    if (request.method === "eth_getBalance") {
      return jsonResponse("0x6f05b59d3b20000");
    }
    throw new Error(`Unexpected RPC method ${request.method}`);
  };

  const provider = createAlchemyCryptoWalletProvider({ apiKey: "server-only-test-key", fetchImpl });
  const balances = await provider.getBalances("ethereum", EVM_ADDRESS);
  assert.deepEqual(balances.map(({ symbol, amount }) => ({ symbol, amount })), [
    { symbol: "ETH", amount: "0.5" },
    { symbol: "EXD", amount: "123.45" },
  ]);
  assert.equal(calls.filter(({ request }) => request.method === "alchemy_getTokenBalances").length, 2);
  assert(calls.every(({ url }) => url.startsWith("https://eth-mainnet.g.alchemy.com/v2/")));
  assert(calls
    .filter(({ request }) => request.method !== "alchemy_getTokenMetadata")
    .every(({ request }) => request.params[0] === EVM_ADDRESS.toLowerCase()));
});

test("uses Base Alchemy RPC host for Base wallets", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    const request = JSON.parse(options.body);
    if (request.method === "alchemy_getTokenBalances") return jsonResponse({ tokenBalances: [] });
    if (request.method === "eth_getBalance") return jsonResponse("0x0");
    throw new Error(`Unexpected RPC method ${request.method}`);
  };

  const provider = createAlchemyCryptoWalletProvider({ apiKey: "server-only-test-key", fetchImpl });
  assert.deepEqual(await provider.getBalances("base", EVM_ADDRESS), []);
  assert(calls.every((url) => url.startsWith("https://base-mainnet.g.alchemy.com/v2/")));
});

test("reports Base and Solana access denials without exposing provider credentials", async () => {
  for (const network of ["base", "solana"]) {
    for (const httpStatus of [401, 403]) {
      const provider = createAlchemyCryptoWalletProvider({
        apiKey: "server-only-test-key",
        fetchImpl: async () => ({ ok: false, status: httpStatus }),
      });
      await assert.rejects(provider.getBalances(network, network === "solana" ? SOLANA_ADDRESS : EVM_ADDRESS), (error) => {
        assert(error instanceof WalletProviderAccessError);
        assert.equal(error.network, network);
        assert.equal(error.httpStatus, httpStatus);
        assert.match(error.message, /Mainnet is enabled/);
        assert.equal(JSON.stringify(error).includes("server-only-test-key"), false);
        assert.equal(error.message.includes("https://"), false);
        return true;
      });
    }
  }
});

test("Solana metadata 503 outages do not block balances or trigger repeated failed batches", async () => {
  let metadataCalls = 0;
  const accounts = Array.from({ length: 24 }, (_, index) => ({
    account: { data: { parsed: { info: {
      mint: `mint-${index}`,
      tokenAmount: { amount: "1234567", decimals: 6 },
    } } } },
  }));
  accounts.push({ account: { data: { parsed: { info: {
    mint: "unclassified-nft",
    tokenAmount: { amount: "1", decimals: 0 },
  } } } } });
  const provider = createAlchemyCryptoWalletProvider({
    apiKey: "server-only-test-key",
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.method === "getBalance") return jsonResponse({ value: 2_000_000_000 });
      if (request.method === "getTokenAccountsByOwner") {
        return jsonResponse({ value: request.params[1].programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ? accounts : [] });
      }
      if (request.method === "getAsset") {
        metadataCalls += 1;
        return { ok: false, status: 503, json: async () => ({ error: { code: 32001 } }) };
      }
      throw new Error(`Unexpected RPC method ${request.method}`);
    },
  });
  const balances = await provider.getBalances("solana", SOLANA_ADDRESS);
  assert.equal(balances.length, 25);
  assert.equal(balances[0].symbol, "SOL");
  assert.equal(balances[0].amount, "2");
  assert(balances.slice(1).every((balance) => balance.amount === "1.234567"));
  assert.equal(balances.some((balance) => balance.assetId === "unclassified-nft"), false);
  assert(metadataCalls <= 8, `Expected at most one metadata batch, got ${metadataCalls} requests`);
});

test("fetches native SOL and non-zero fungible SPL tokens, excluding NFTs", async () => {
  const calls = [];
  const mint = "So11111111111111111111111111111111111111112";
  const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const unknownMint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
  const nftMint = "11111111111111111111111111111111";
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request.method);
    if (request.method === "getBalance") return jsonResponse({ value: 2_000_000_000 });
    if (request.method === "getTokenAccountsByOwner") {
      const programId = request.params[1].programId;
      if (programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
        return jsonResponse({ value: [
          { account: { data: { parsed: { info: { mint, tokenAmount: { amount: "1250000", decimals: 6 } } } } } },
          { account: { data: { parsed: { info: { mint: usdcMint, tokenAmount: { amount: "5000000", decimals: 6 } } } } } },
          { account: { data: { parsed: { info: { mint: unknownMint, tokenAmount: { amount: "300000", decimals: 6 } } } } } },
          { account: { data: { parsed: { info: { mint: nftMint, tokenAmount: { amount: "1", decimals: 0 } } } } } },
          { account: { data: { parsed: { info: { mint: "zeroMint", tokenAmount: { amount: "0", decimals: 6 } } } } } },
        ] });
      }
      return jsonResponse({ value: [] });
    }
    if (request.method === "getAsset") {
      assert.equal(Array.isArray(request.params), false);
      const assetId = request.params.id;
      if (assetId === unknownMint) return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, error: { message: "Asset not found" } }) };
      if (assetId === usdcMint) return jsonResponse({ interface: "Custom", token_info: { symbol: "USDC", decimals: 6 }, content: { metadata: { name: "USD Coin" } } });
      return jsonResponse(assetId === mint
        ? { interface: "FungibleToken", token_info: { symbol: "WSOL", decimals: 6 }, content: { metadata: { name: "Wrapped SOL" } } }
        : { interface: "V1_NFT", token_info: { symbol: "NFT", decimals: 0 } });
    }
    throw new Error(`Unexpected RPC method ${request.method}`);
  };

  const provider = createAlchemyCryptoWalletProvider({ apiKey: "server-only-test-key", fetchImpl });
  const balances = await provider.getBalances("solana", SOLANA_ADDRESS);
  assert.deepEqual(balances.map(({ symbol, amount }) => ({ symbol, amount })), [
    { symbol: "SOL", amount: "2" },
    { symbol: "WSOL", amount: "1.25" },
    { symbol: "USDC", amount: "5" },
    { symbol: "JUPyi...DvCN", amount: "0.3" },
  ]);
  assert.equal(calls.filter((method) => method === "getTokenAccountsByOwner").length, 2);
});
