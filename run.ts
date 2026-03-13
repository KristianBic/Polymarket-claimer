import * as dotenv from 'dotenv';
import { redeemPolymarketPositions } from './Redeem-positions-through-relayer-client-and-builders-account';
import { RelayerTxType } from "@polymarket/builder-relayer-client";

// Load environment variables
dotenv.config();

async function main() {
  // Validate env vars
  const privateKey = process.env.PRIVATE_KEY;
  const apiKey = process.env.API_KEY;
  const secret = process.env.API_SECRET;
  const passphrase = process.env.API_PASSPHRASE;
  const walletType = process.env.WALLET_TYPE === 'PROXY' ? RelayerTxType.PROXY : RelayerTxType.SAFE;

  if (!privateKey || !apiKey || !secret || !passphrase) {
    console.error('❌ Error: Missing environment variables in .env file.');
    console.error('Please ensure PRIVATE_KEY, API_KEY, API_SECRET, and API_PASSPHRASE are set.');
    process.exit(1);
  }

  console.log('🚀 Starting Polymarket Position Redeemer in Continuous Mode...');
  console.log(`ℹ️  Wallet Type: ${walletType}`);
  console.log(`ℹ️  Check Interval: 5 minutes`);

  const runCycle = async () => {
    console.log(`\n\n-------------------------------------------------------------`);
    console.log(`🕒 [${new Date().toLocaleString()}] Checking for positions to redeem...`);
    try {
      const result = await redeemPolymarketPositions({
        // Use the Proxy Address from env
        safeAddress: process.env.PROXY_ADDRESS || '', 
        traderPrivateKey: privateKey,
        chainId: parseInt(process.env.CHAIN_ID || '137'),
        rpcUrl: process.env.RPC_URL || 'https://polygon.drpc.org',
        collateralToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
        conditionalTokensAddress: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045', // Standard on Polygon
        builderConfig: {
          apiKey: apiKey,
          secret: secret,
          passphrase: passphrase,
        },
        relayerTxType: walletType,
        onProgress: (msg, data) => console.log(`[LOG] ${msg}`, data ? JSON.stringify(data) : '')
      });

      console.log('\n✅ Cycle Finished!');
      console.log('Summary:', {
        Success: result.redeemed,
        Failed: result.failed,
        Total: result.totalPositions
      });

      if (result.errors && result.errors.length > 0) {
        console.log('\n⚠️ Errors encountered:');
        result.errors.forEach(e => console.error(`- ${e}`));
      }
      
    } catch (error) {
      console.error('\n❌ Fatal Error during cycle:', error);
    }
  };

  // Run the first check immediately
  await runCycle();

  // Set up the 15-minute interval loop
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  console.log(`\n⏳ Next check scheduled in 5 minutes... (Keep this window open)`);
  
  setInterval(async () => {
    await runCycle();
    console.log(`\n⏳ Next check scheduled in 5 minutes... (Keep this window open)`);
  }, FIVE_MINUTES_MS);
}

main();
