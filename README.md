# Polymarket Position Redeemer

This utility script securely redeems winning positions on Polymarket using the official Relayer API. It supports both standard Browser Wallets (Metamask/Gnosis Safe) and Email Sign-In (MagicLink/Proxy) accounts.

## Prerequisites

- **Node.js** (v16 or higher)
- **Polymarket Account** with API Keys
- WINNING positions to redeem (Wait for market resolution!)

## Installation

1.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Create your configuration file:**
    Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    # or on Windows
    copy .env.example .env
    ```

2.  **Edit `.env` and fill in your details:**

    *   `PRIVATE_KEY`: Your wallet's private key (Export from Metamask or Reveal from MagicLink).
    *   `API_KEY`, `API_SECRET`, `API_PASSPHRASE`: Go to [polymarket.com/profile](https://polymarket.com/profile) -> Settings -> API Keys to generate these.
    *   `PROXY_ADDRESS`: Go to your Profile page and copy the address shown (usually starts with `0x...`). This is your "Proxy" or "SCA" address where funds are held.

3.  **Set your Wallet Type (`WALLET_TYPE`):**

    *   **Browser Wallet (Metamask/Coinbase):** Set `WALLET_TYPE=SAFE`
    *   **Email Sign-In (Google/MagicLink):** Set `WALLET_TYPE=PROXY`

    > **Important:** If you set this incorrectly, the script will run but find "0 redeemable positions" or fail execution.

## Usage

Run the redemption script:

```bash
npx ts-node run.ts
```

## Troubleshooting

-   **"No redeemable positions found"**:
    -   Check if the market has fully resolved.
    -   Check if you are using the correct `WALLET_TYPE`.
    -   Verify your `PROXY_ADDRESS` in `.env`.
    -   Check if you have already redeemed them (look at your Proxy address on PolygonScan).

-   **"Invalid configuration" / "Unauthorized"**:
    -   Double check your API Keys.
    -   Make sure your Private Key matches the account for those API Keys.
