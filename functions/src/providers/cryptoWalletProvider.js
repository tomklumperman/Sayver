const bs58Module = require("bs58");

const bs58 = bs58Module.decode ? bs58Module : bs58Module.default;
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const MAX_TOKEN_PAGES = 100;
const METADATA_CONCURRENCY = 8;

const WALLET_NETWORKS = Object.freeze({
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    alchemyNetwork: "eth-mainnet",
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/",
    nativeSymbol: "ETH",
    nativeName: "Ether",
    nativeDecimals: 18,
    kind: "evm",
  },
  base: {
    id: "base",
    name: "Base",
    alchemyNetwork: "base-mainnet",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/",
    nativeSymbol: "ETH",
    nativeName: "Ether",
    nativeDecimals: 18,
    kind: "evm",
  },
  solana: {
    id: "solana",
    name: "Solana",
    alchemyNetwork: "solana-mainnet",
    rpcUrl: "https://solana-mainnet.g.alchemy.com/v2/",
    nativeSymbol: "SOL",
    nativeName: "Solana",
    nativeDecimals: 9,
    kind: "solana",
  },
});

function getWalletNetwork(networkId) {
  return WALLET_NETWORKS[String(networkId || "").toLowerCase()] || null;
}

function isValidPublicAddress(networkId, address) {
  if (typeof address !== "string") return false;
  const value = address.trim();
  const network = getWalletNetwork(networkId);
  if (!network) return false;

  if (network.kind === "evm") {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch (_error) {
    return false;
  }
}

function formatUnits(rawAmount, decimals) {
  const amount = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const remainder = amount % scale;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function makeBalance({ assetId, symbol, name, decimals, rawAmount, network }) {
  return {
    assetId,
    symbol,
    name,
    decimals,
    amount: formatUnits(rawAmount, decimals),
    rawAmount: String(rawAmount),
    network,
  };
}

const NFT_INTERFACES = new Set(["v1_nft", "v2_nft", "programmablenft", "legacynft", "mplcorecollection", "mplcoreasset", "identity"]);

function isFungibleSolanaAsset(asset, onChainDecimals) {
  const type = String(asset?.interface || asset?.token_info?.token_type || "").toLowerCase();
  if (type === "fungibletoken" || type === "fungibleasset" || type === "fungible") return true;
  if (NFT_INTERFACES.has(type) || type.includes("nft")) return false;
  // Some fungible mints (e.g. USDC) report a "Custom" interface; NFTs always have 0 decimals.
  const decimals = Number(asset?.token_info?.decimals ?? onChainDecimals);
  return Number.isInteger(decimals) && decimals > 0;
}

class WalletProviderAccessError extends Error {
  constructor(network, method, httpStatus) {
    super(`Alchemy denied access to ${network.name}. Check that ${network.name} Mainnet is enabled for the Alchemy app used by Sayver.`);
    this.name = "WalletProviderAccessError";
    this.network = network.id;
    this.method = method;
    this.httpStatus = httpStatus;
  }
}

function createAlchemyCryptoWalletProvider({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("Alchemy API key is not configured on the server.");

  async function rpc(network, method, params) {
    const response = await fetchImpl(`${network.rpcUrl}${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new WalletProviderAccessError(network, method, response.status);
    }
    if (!response.ok) {
      const error = new Error("Blockchain provider request failed.");
      error.httpStatus = response.status;
      throw error;
    }
    const payload = await response.json();
    if (payload?.error || typeof payload?.result === "undefined") {
      const error = new Error("Blockchain provider returned an invalid response.");
      error.rpcCode = Number.isInteger(payload?.error?.code) ? payload.error.code : null;
      throw error;
    }
    return payload.result;
  }

  async function getEvmTokenBalances(network, address) {
    const tokenBalances = [];
    let pageKey = null;

    for (let page = 0; page < MAX_TOKEN_PAGES; page += 1) {
      const options = pageKey ? { pageKey, maxCount: 100 } : { maxCount: 100 };
      const params = [address, "erc20", options];
      const result = await rpc(network, "alchemy_getTokenBalances", params);
      tokenBalances.push(...(Array.isArray(result?.tokenBalances) ? result.tokenBalances : []));
      pageKey = result?.pageKey || null;
      if (!pageKey) break;
    }

    if (pageKey) throw new Error("Wallet has too many tokens to sync in one request.");

    const nonZeroBalances = tokenBalances.filter((item) => {
      if (item?.error || !item?.tokenBalance) return false;
      try {
        return BigInt(item.tokenBalance) > 0n;
      } catch (_error) {
        return false;
      }
    });

    const tokens = [];
    for (let offset = 0; offset < nonZeroBalances.length; offset += METADATA_CONCURRENCY) {
      const batch = nonZeroBalances.slice(offset, offset + METADATA_CONCURRENCY);
      const batchTokens = await Promise.all(batch.map(async (item) => {
        const metadata = await rpc(network, "alchemy_getTokenMetadata", [item.contractAddress]);
        const decimals = Number(metadata?.decimals);
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
        return makeBalance({
          assetId: item.contractAddress.toLowerCase(),
          symbol: metadata?.symbol || `${item.contractAddress.slice(0, 6)}...`,
          name: metadata?.name || metadata?.symbol || item.contractAddress,
          decimals,
          rawAmount: BigInt(item.tokenBalance),
          network: network.id,
        });
      }));
      tokens.push(...batchTokens.filter(Boolean));
    }

    const nativeHex = await rpc(network, "eth_getBalance", [address, "latest"]);
    const nativeRaw = BigInt(nativeHex);
    if (nativeRaw > 0n) {
      tokens.unshift(makeBalance({
        assetId: `native:${network.id}`,
        symbol: network.nativeSymbol,
        name: network.nativeName,
        decimals: network.nativeDecimals,
        rawAmount: nativeRaw,
        network: network.id,
      }));
    }
    return tokens;
  }

  async function getSolanaTokenBalances(network, address) {
    const nativePromise = rpc(network, "getBalance", [address, { commitment: "finalized" }]);
    const ownerTokenPromises = [
      rpc(network, "getTokenAccountsByOwner", [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed", commitment: "finalized" }]),
      rpc(network, "getTokenAccountsByOwner", [address, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: "jsonParsed", commitment: "finalized" }]),
    ];
    const [nativeResult, ...ownerResults] = await Promise.all([nativePromise, ...ownerTokenPromises]);
    const tokenByMint = new Map();

    for (const ownerResult of ownerResults) {
      for (const tokenAccount of ownerResult?.value || []) {
        const info = tokenAccount?.account?.data?.parsed?.info;
        const tokenAmount = info?.tokenAmount;
        const mint = info?.mint;
        if (!mint || !tokenAmount?.amount || !Number.isInteger(Number(tokenAmount.decimals))) continue;
        let rawAmount;
        try {
          rawAmount = BigInt(tokenAmount.amount);
        } catch (_error) {
          continue;
        }
        if (rawAmount <= 0n) continue;

        const existing = tokenByMint.get(mint);
        if (existing) {
          existing.rawAmount += rawAmount;
        } else {
          tokenByMint.set(mint, { mint, decimals: Number(tokenAmount.decimals), rawAmount });
        }
      }
    }

    const mints = [...tokenByMint.values()];
    const tokens = [];
    let metadataUnavailable = false;
    for (let offset = 0; offset < mints.length; offset += METADATA_CONCURRENCY) {
      const batch = mints.slice(offset, offset + METADATA_CONCURRENCY);
      const metadataBatch = await Promise.all(batch.map(async (item) => {
        let asset = null;
        if (!metadataUnavailable) {
          try {
            asset = await rpc(network, "getAsset", { id: item.mint });
          } catch (error) {
            if (error.httpStatus >= 500 || error.httpStatus === 429
              || Math.abs(error.rpcCode) === 32001
              || ["TimeoutError", "AbortError"].includes(error.name)) {
              metadataUnavailable = true;
            }
          }
        }
        if (!isFungibleSolanaAsset(asset, item.decimals)) return null;
        const assetInfo = asset?.token_info || {};
        const decimals = Number.isInteger(Number(assetInfo.decimals)) ? Number(assetInfo.decimals) : item.decimals;
        return makeBalance({
          assetId: item.mint,
          symbol: assetInfo.symbol || asset?.content?.metadata?.symbol || `${item.mint.slice(0, 5)}...${item.mint.slice(-4)}`,
          name: asset?.content?.metadata?.name || assetInfo.symbol || item.mint,
          decimals,
          rawAmount: item.rawAmount,
          network: network.id,
        });
      }));
      tokens.push(...metadataBatch.filter(Boolean));
    }

    const nativeRaw = BigInt(nativeResult?.value || 0);
    if (nativeRaw > 0n) {
      tokens.unshift(makeBalance({
        assetId: `native:${network.id}`,
        symbol: network.nativeSymbol,
        name: network.nativeName,
        decimals: network.nativeDecimals,
        rawAmount: nativeRaw,
        network: network.id,
      }));
    }
    return tokens;
  }

  return Object.freeze({
    async getBalances(networkId, address) {
      const network = getWalletNetwork(networkId);
      if (!network) throw new Error("Unsupported wallet network.");
      if (!isValidPublicAddress(networkId, address)) throw new Error("Invalid public wallet address.");
      const normalizedAddress = network.kind === "evm" ? address.trim().toLowerCase() : address.trim();
      return network.kind === "evm"
        ? getEvmTokenBalances(network, normalizedAddress)
        : getSolanaTokenBalances(network, normalizedAddress);
    },
  });
}

module.exports = {
  WALLET_NETWORKS,
  WalletProviderAccessError,
  createAlchemyCryptoWalletProvider,
  formatUnits,
  getWalletNetwork,
  isFungibleSolanaAsset,
  isValidPublicAddress,
  makeBalance,
};
