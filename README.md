# Polymarket Position Redeemer

This utility script securely redeems winning positions on Polymarket using the official Relayer API. It supports both standard Browser Wallets (Metamask/Gnosis Safe) and Email Sign-In (MagicLink/Proxy) accounts.

## Prerequisites

- **Node.js** (v16 or higher)
- **Polymarket Account** with API Keys
- WINNING positions to redeem (Wait for market resolution!)

## 🚀 Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Your Accounts:**
   The claimer supports multiple accounts. You must create an `.env.account1` file (and others) based on the provided example.
   
   First, make a copy of the example:
   ```bash
   cp .env.account.example .env.account1
   ```
   
   Next, edit `.env.account1` with your credentials. You can choose to authenticate your account with either:
   1. **Builder API Keys** (default, from [Builder Profile](https://polymarket.com/settings))
   2. **Relayer API Keys** (from [API Keys Settings](https://polymarket.com/settings?tab=api-keys))

   You can create as many account files as you'd like (e.g., `.env.account2`, `.env.account-main`, etc.). The script will automatically process any `.env.account*` files.

3. **Configure Shared Settings (Optional):**
   You can optionally set an `RPC_URL` in the main `.env` file that applies to all accounts.

## ⚙️ Running the Script

You can start the continuous background runner using `ts-node`:

```bash
npx ts-node run.ts
```

**What it does:**
1. Dynamically loads all your `.env.account*` files
2. Authenticates each account sequentially using their specified `AUTH_METHOD`
3. Automatically fetches and redeems all redeemable positions using Polymarket's Relayer for gasless transactions
4. Waits 25 minutes
5. Loops infinitely

## Troubleshooting

-   **"No redeemable positions found"**:
    -   Check if the market has fully resolved.
    -   Check if you are using the correct `WALLET_TYPE`.
    -   Verify your `PROXY_ADDRESS` in `.env`.
    -   Check if you have already redeemed them (look at your Proxy address on PolygonScan).

-   **"Invalid configuration" / "Unauthorized"**:
    -   Double check your API Keys.
    -   Make sure your Private Key matches the account for those API Keys.
