import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { redeemPolymarketPositions } from './Redeem-positions-through-relayer-client-and-builders-account';
import { RelayerTxType } from "@polymarket/builder-relayer-client";

// Load shared config from .env (CHAIN_ID, RPC_URL, etc.)
dotenv.config();

// ── Account configuration ────────────────────────────────────────────

interface AccountConfig {
  name: string;
  fileName: string;
  privateKey: string;
  proxyAddress: string;
  walletType: RelayerTxType;
  chainId: number;
  rpcUrl: string;
  authMethod: 'builder' | 'relayer';
  // Builder auth
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  // Relayer auth
  relayerApiKey?: string;
  relayerApiKeyAddress?: string;
}

// ── Account discovery ────────────────────────────────────────────────

function discoverAccounts(): AccountConfig[] {
  const cwd = process.cwd();
  const files = fs.readdirSync(cwd)
    .filter(f => f.startsWith('.env.account') && f !== '.env.account.example')
    .sort();

  if (files.length === 0) {
    console.error('❌ No account files found.');
    console.error('   Create .env.account1, .env.account2, etc. based on .env.account.example');
    process.exit(1);
  }

  const accounts: AccountConfig[] = [];

  for (const file of files) {
    const filePath = path.join(cwd, file);
    const parsed = dotenv.parse(fs.readFileSync(filePath));

    const name = parsed.ACCOUNT_NAME || file.replace('.env.', '');
    const privateKey = parsed.PRIVATE_KEY;
    const proxyAddress = parsed.PROXY_ADDRESS || '';
    const walletType = parsed.WALLET_TYPE === 'PROXY' ? RelayerTxType.PROXY : RelayerTxType.SAFE;
    const authMethod = (parsed.AUTH_METHOD || 'builder').toLowerCase() as 'builder' | 'relayer';

    // Per-account overrides, fallback to shared .env, fallback to defaults
    const chainId = parseInt(parsed.CHAIN_ID || process.env.CHAIN_ID || '137');
    const rpcUrl = parsed.RPC_URL || process.env.RPC_URL || 'https://polygon.drpc.org';

    if (!privateKey) {
      console.warn(`⚠️  Skipping ${file}: Missing PRIVATE_KEY`);
      continue;
    }

    if (authMethod === 'builder') {
      if (!parsed.API_KEY || !parsed.API_SECRET || !parsed.API_PASSPHRASE) {
        console.warn(`⚠️  Skipping ${file}: AUTH_METHOD=builder requires API_KEY, API_SECRET, API_PASSPHRASE`);
        continue;
      }
      accounts.push({
        name, fileName: file, privateKey, proxyAddress, walletType, chainId, rpcUrl,
        authMethod,
        apiKey: parsed.API_KEY,
        apiSecret: parsed.API_SECRET,
        apiPassphrase: parsed.API_PASSPHRASE,
      });
    } else if (authMethod === 'relayer') {
      if (!parsed.RELAYER_API_KEY || !parsed.RELAYER_API_KEY_ADDRESS) {
        console.warn(`⚠️  Skipping ${file}: AUTH_METHOD=relayer requires RELAYER_API_KEY, RELAYER_API_KEY_ADDRESS`);
        continue;
      }
      accounts.push({
        name, fileName: file, privateKey, proxyAddress, walletType, chainId, rpcUrl,
        authMethod,
        relayerApiKey: parsed.RELAYER_API_KEY,
        relayerApiKeyAddress: parsed.RELAYER_API_KEY_ADDRESS,
      });
    } else {
      console.warn(`⚠️  Skipping ${file}: Unknown AUTH_METHOD="${authMethod}". Use "builder" or "relayer".`);
    }
  }

  return accounts;
}

// ── Per-account processing ───────────────────────────────────────────

async function processAccount(account: AccountConfig): Promise<void> {
  const prefix = `[${account.name}]`;
  console.log(`\n${prefix} 🔑 Auth: ${account.authMethod} | Wallet: ${account.walletType}`);

  // Build the authConfig based on the authentication method
  const authConfig = account.authMethod === 'relayer'
    ? {
        relayerApiKey: account.relayerApiKey!,
        relayerApiKeyAddress: account.relayerApiKeyAddress!,
      }
    : {
        apiKey: account.apiKey!,
        secret: account.apiSecret!,
        passphrase: account.apiPassphrase!,
      };

  const result = await redeemPolymarketPositions({
    safeAddress: account.proxyAddress,
    traderPrivateKey: account.privateKey,
    chainId: account.chainId,
    rpcUrl: account.rpcUrl,
    collateralToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
    conditionalTokensAddress: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
    authConfig,
    relayerTxType: account.walletType,
    onProgress: (msg, data) => console.log(`${prefix} [LOG] ${msg}`, data ? JSON.stringify(data) : ''),
  });

  console.log(`${prefix} ✅ Done | Redeemed: ${result.redeemed} | Failed: ${result.failed} | Total: ${result.totalPositions}`);

  if (result.errors && result.errors.length > 0) {
    console.log(`${prefix} ⚠️  Errors:`);
    result.errors.forEach(e => console.error(`${prefix}   - ${e}`));
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Polymarket Multi-Account Position Redeemer');
  console.log('━'.repeat(60));

  const accounts = discoverAccounts();

  console.log(`📋 Found ${accounts.length} account(s):`);
  accounts.forEach((a, i) =>
    console.log(`   ${i + 1}. ${a.name} (${a.authMethod} auth, ${a.walletType} wallet)`)
  );

  const runCycle = async () => {
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`🕒 [${new Date().toLocaleString()}] Starting redemption cycle...`);
    console.log('═'.repeat(60));

    for (const account of accounts) {
      try {
        await processAccount(account);
      } catch (error) {
        console.error(`\n[${account.name}] ❌ Fatal error:`, error);
      }
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`✅ Cycle complete for all ${accounts.length} account(s)`);
  };

  // Run immediately
  await runCycle();

  // Schedule recurring checks every 25 minutes
  const INTERVAL_MS = 25 * 60 * 1000;
  console.log(`\n⏳ Next cycle in 25 minutes... (Keep this window open)`);

  setInterval(async () => {
    await runCycle();
    console.log(`\n⏳ Next cycle in 25 minutes... (Keep this window open)`);
  }, INTERVAL_MS);
}

main();
