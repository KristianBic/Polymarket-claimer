/**
 * Generic Polymarket Position Redemption Script
 * 
 * This script can be used in any project to redeem Polymarket positions.
 * It has no dependencies on project-specific imports.
 * 
 * Usage:
 *   import { redeemPolymarketPositions } from './redeem-positions';
 *   
 *   const result = await redeemPolymarketPositions({
 *     safeAddress: '0x...',
 *     traderPrivateKey: '0x...',
 *     chainId: 137,
 *     collateralToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
 *     conditionalTokensAddress: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
 *     relayerUrl: 'https://relayer-v2.polymarket.com',
 *     rpcUrl: 'https://polygon-rpc.com',
 *     dataApiUrl: 'https://data-api.polymarket.com',
 *     builderConfig: {
 *       apiKey: '...',
 *       secret: '...',
 *       passphrase: '...',
 *     },
 *   });
 */

import { ethers } from "ethers";
import axios from "axios";
import {
  RelayClient,
  OperationType,
  RelayerTransactionState,
  RelayerTxType,
} from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";

// Minimal ABI for redeemPositions
const REDEEM_POSITIONS_ABI = [
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
];

export interface RedeemPosition {
  id: string;
  conditionId: string;
  indexSet: number;
  outcomeIndex?: number;
  size?: number;
  asset?: string;
}

export interface BuilderCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface RedeemOptions {
  /** Safe wallet address that holds the positions */
  safeAddress: string;
  /** Private key of the trader wallet (used for signing) */
  traderPrivateKey: string;
  /** Chain ID (137 for Polygon mainnet, 80002 for Amoy testnet) */
  chainId: number;
  /** Collateral token address (e.g., USDC on Polygon) */
  collateralToken: string;
  /** ConditionalTokens contract address */
  conditionalTokensAddress: string;
  /** Relayer URL */
  relayerUrl?: string;
  /** RPC URL for the blockchain */
  rpcUrl?: string;
  /** Polymarket Data API URL */
  dataApiUrl?: string;
  /** Builder program credentials */
  builderConfig: BuilderCredentials | { signingUrl: string };
  /** Delay between transactions in milliseconds (default: 2000) */
  delayBetweenTransactions?: number;
  /** Optional callback for progress updates */
  /** Optional callback for progress updates */
  onProgress?: (message: string, data?: any) => void;
  /** Wallet type: SAFE or PROXY (defaults to SAFE) */
  relayerTxType?: RelayerTxType;
}

export interface RedeemResult {
  success: boolean;
  redeemed: number;
  failed: number;
  totalPositions: number;
  errors?: string[];
  transactions: Array<{
    conditionId: string;
    indexSets: number[];
    transactionId?: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Normalize an address to lowercase
 */
function normalizeAddress(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Fetch redeemable positions from Polymarket API
 */
async function fetchRedeemablePositions(
  ownerAddress: string,
  dataApiUrl: string = "https://data-api.polymarket.com",
): Promise<RedeemPosition[]> {
  const lowerAddress = normalizeAddress(ownerAddress);
  const positions: RedeemPosition[] = [];
  const seen = new Set<string>();

  const addPosition = (raw: any) => {
    const conditionIdRaw = raw?.conditionId;
    if (!conditionIdRaw || typeof conditionIdRaw !== "string") {
      return;
    }

    const conditionId = conditionIdRaw.startsWith("0x")
      ? conditionIdRaw.toLowerCase()
      : `0x${conditionIdRaw.toLowerCase()}`;

    let indexSet: number | null = null;

    if (raw?.outcomeIndex !== undefined && raw?.outcomeIndex !== null) {
      const parsed = Number(raw.outcomeIndex);
      if (Number.isFinite(parsed)) {
        indexSet = parsed + 1;
      }
    }

    if (indexSet === null && Array.isArray(raw?.indexSets) && raw.indexSets.length > 0) {
      const candidate = Number(raw.indexSets[0]);
      if (Number.isFinite(candidate) && candidate > 0) {
        indexSet = candidate;
      }
    }

    if (indexSet === null) {
      // Default to Down (indexSet 2) if we can't determine
      indexSet = 2;
    }

    if (!conditionId || !indexSet || indexSet <= 0) {
      return;
    }

    const key = `${conditionId}-${indexSet}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    positions.push({
      id: typeof raw?.id === "string" ? raw.id : "",
      conditionId,
      indexSet,
      outcomeIndex:
        raw?.outcomeIndex !== undefined && raw?.outcomeIndex !== null
          ? Number(raw.outcomeIndex)
          : undefined,
      size:
        typeof raw?.size === "number"
          ? raw.size
          : raw?.size !== undefined
            ? Number(raw.size)
            : undefined,
      asset: typeof raw?.asset === "string" ? raw.asset : undefined,
    });
  };

  // Fetch from Polymarket Data API
  try {
    const response = await axios.get(`${dataApiUrl}/positions`, {
      params: {
        user: lowerAddress,
      },
      timeout: 30000,
    });

    if (Array.isArray(response.data)) {
      const redeemable = response.data.filter((p: any) => p?.redeemable === true);
      for (const raw of redeemable) {
        addPosition(raw);
      }
    }
  } catch (error: any) {
    if (error.response?.status !== 404) {
      throw new Error(
        `Failed to fetch redeemable positions from API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return positions;
}

/**
 * Create a relay client for executing transactions
 */
function createRelayClient(
  privateKey: string,
  chainId: number,
  rpcUrl: string,
  relayerUrl: string,
  builderConfig: BuilderCredentials | { signingUrl: string },
  relayerTxType?: RelayerTxType,
) {
  const networkName =
    chainId === 137 ? "polygon" : chainId === 80002 ? "amoy" : "custom";
  const networkConfig = {
    name: networkName,
    chainId,
  };

  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, networkConfig);
  const signer = new ethers.Wallet(privateKey, provider);

  let config: BuilderConfig;
  if ("signingUrl" in builderConfig) {
    config = new BuilderConfig({
      remoteBuilderConfig: {
        url: builderConfig.signingUrl,
      },
    });
  } else {
    config = new BuilderConfig({
      localBuilderCreds: {
        key: builderConfig.apiKey,
        secret: builderConfig.secret,
        passphrase: builderConfig.passphrase,
      },
    });
  }

  const client = new RelayClient(relayerUrl, chainId, signer, config, relayerTxType);
  return client;
}

/**
 * Main function to redeem Polymarket positions
 */
export async function redeemPolymarketPositions(
  options: RedeemOptions,
): Promise<RedeemResult> {
  const {
    safeAddress,
    traderPrivateKey,
    chainId,
    collateralToken,
    conditionalTokensAddress,
    relayerUrl = "https://relayer-v2.polymarket.com",
    rpcUrl = "https://polygon-rpc.com",
    dataApiUrl = "https://data-api.polymarket.com",
    builderConfig,
    delayBetweenTransactions = 2000,
    onProgress,
    relayerTxType,
  } = options;

  const safeAddressNormalized = normalizeAddress(safeAddress);

  if (!safeAddressNormalized) {
    throw new Error("Safe address is required");
  }

  if (!traderPrivateKey) {
    throw new Error("Trader private key is required");
  }

  const log = (message: string, data?: any) => {
    if (onProgress) {
      onProgress(message, data);
    } else {
      console.log(`[redeem] ${message}`, data || "");
    }
  };

  // Fetch redeemable positions
  log("Fetching redeemable positions", { safeAddress: safeAddressNormalized });
  const positions = await fetchRedeemablePositions(safeAddressNormalized, dataApiUrl);

  if (!positions || positions.length === 0) {
    log("No redeemable positions found");
    return {
      success: true,
      redeemed: 0,
      failed: 0,
      totalPositions: 0,
      transactions: [],
    };
  }

  log("Found redeemable positions", {
    totalCount: positions.length,
    safeAddress: safeAddressNormalized,
  });

  // Group positions by conditionId
  const positionsByCondition = new Map<string, Set<number>>();
  for (const position of positions) {
    const conditionId = position.conditionId;
    if (!conditionId) continue;

    if (!positionsByCondition.has(conditionId)) {
      positionsByCondition.set(conditionId, new Set());
    }
    positionsByCondition.get(conditionId)!.add(position.indexSet);
  }

  log("Grouped positions by condition", {
    uniqueConditions: positionsByCondition.size,
  });

  // Create relay client
  const relayClient = createRelayClient(
    traderPrivateKey,
    chainId,
    rpcUrl,
    relayerUrl,
    builderConfig,
    relayerTxType,
  );

  // Create interface for encoding calls
  const conditionalInterface = new ethers.utils.Interface(REDEEM_POSITIONS_ABI);
  const parentCollectionId = ethers.constants.HashZero; // 0x00...00 for simple markets
  const collateralTokenLower = collateralToken.toLowerCase();

  let successfulRedeems = 0;
  let failedRedeems = 0;
  const errors: string[] = [];
  const transactions: RedeemResult["transactions"] = [];

  // Redeem each condition
  for (const [conditionId, indexSetsSet] of positionsByCondition.entries()) {
    try {
      // Convert conditionId to bytes32
      let conditionIdBytes: string;
      if (conditionId.startsWith("0x")) {
        conditionIdBytes = conditionId;
      } else {
        conditionIdBytes = `0x${conditionId}`;
      }

      // Ensure it's exactly 32 bytes (66 characters with 0x)
      if (conditionIdBytes.length !== 66) {
        const errorMsg = `Invalid conditionId: ${conditionId.substring(0, 32)}...`;
        log("Invalid conditionId length", {
          conditionId: conditionId.substring(0, 32),
          length: conditionIdBytes.length,
        });
        failedRedeems++;
        errors.push(errorMsg);
        transactions.push({
          conditionId: conditionId.substring(0, 16) + "...",
          indexSets: Array.from(indexSetsSet),
          success: false,
          error: errorMsg,
        });
        continue;
      }

      // Convert the Set to a sorted array
      const indexSets = Array.from(indexSetsSet).sort((a, b) => a - b);

      log("Redeeming positions via relayer", {
        conditionId: conditionId.substring(0, 16) + "...",
        indexSets,
      });

      // Encode the redeemPositions call
      const redeemData = conditionalInterface.encodeFunctionData("redeemPositions", [
        collateralTokenLower,
        parentCollectionId,
        conditionIdBytes,
        indexSets,
      ]);

      // Execute via relayer
      const relayerResponse = await relayClient.execute(
        [
          {
            to: conditionalTokensAddress.toLowerCase(),
            data: redeemData,
            value: "0",
            // operation: OperationType.Call, // Removed as it causes type issues and is handled by the SDK
          } as any,
        ],
        JSON.stringify({
          action: "redeem-positions",
          conditionId: conditionId.substring(0, 16) + "...",
          indexSets,
        }),
      );

      log("Relayer transaction submitted", {
        conditionId: conditionId.substring(0, 16) + "...",
        transactionId: relayerResponse.transactionID,
      });

      // Wait for confirmation
      const receipt = await relayerResponse.wait();

      // Accept STATE_MINED and STATE_CONFIRMED as success
      const isSuccess =
        receipt &&
        (receipt.state === RelayerTransactionState.STATE_CONFIRMED ||
          receipt.state === RelayerTransactionState.STATE_MINED);

      if (isSuccess) {
        successfulRedeems++;

        log("Transaction confirmed via relayer", {
          conditionId: conditionId.substring(0, 16) + "...",
          transactionId: relayerResponse.transactionID,
          state: receipt.state,
        });

        transactions.push({
          conditionId: conditionId.substring(0, 16) + "...",
          indexSets,
          transactionId: relayerResponse.transactionID,
          success: true,
        });
      } else {
        failedRedeems++;
        const state = receipt?.state || "unknown";
        const errorMsg = `Transaction failed (state: ${state})`;
        errors.push(
          `Transaction failed for conditionId: ${conditionId.substring(0, 16)}... (state: ${state})`,
        );
        log("Transaction failed via relayer", {
          conditionId: conditionId.substring(0, 16) + "...",
          transactionId: relayerResponse.transactionID,
          state,
        });

        transactions.push({
          conditionId: conditionId.substring(0, 16) + "...",
          indexSets,
          transactionId: relayerResponse.transactionID,
          success: false,
          error: errorMsg,
        });
      }

      // Delay between transactions
      if (positionsByCondition.size > 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenTransactions));
      }
    } catch (error) {
      failedRedeems++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(
        `Error redeeming conditionId ${conditionId.substring(0, 16)}...: ${errorMessage}`,
      );
      log("Error redeeming positions", {
        conditionId: conditionId.substring(0, 16) + "...",
        error: errorMessage,
      });

      transactions.push({
        conditionId: conditionId.substring(0, 16) + "...",
        indexSets: Array.from(indexSetsSet),
        success: false,
        error: errorMessage,
      });
    }
  }

  log("Redemption complete", {
    successfulRedeems,
    failedRedeems,
    totalPositions: positions.length,
  });

  return {
    success: true,
    redeemed: successfulRedeems,
    failed: failedRedeems,
    totalPositions: positions.length,
    errors: errors.length > 0 ? errors : undefined,
    transactions,
  };
}

