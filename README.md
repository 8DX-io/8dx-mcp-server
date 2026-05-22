# 8DX MCP Server

MCP server that exposes 8DX DEX aggregator REST endpoints as tools for AI agents.

The server is a thin TypeScript wrapper around the 8DX REST API plus safe AI-flow helpers.
By default it does not hold keys, sign, or custody funds. It can create WalletConnect
requests so the user's own wallet signs and broadcasts after approval; the MCP-side local
signer remains opt-in and disabled unless explicitly configured.

## Tools

Supported `blockchain` values for quote, swap, permit, and limit-order tools:
`ethereum`, `bsc`, and `arbitrum`.

### AI wallet session

These tools help an AI agent keep conversational context for terminal or Telegram-style
flows. The session is local in memory and stores only public wallet metadata.

| Tool                         | Description                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `eightdx_login_wallet`       | Records a public wallet address, blockchain, optional wallet app, and optional client surface for this MCP run. |
| `eightdx_get_wallet_session` | Reads the current local wallet session, if any.                                                                 |
| `eightdx_logout_wallet`      | Clears the local wallet session. This does not revoke token approvals or cancel on-chain permissions.           |

### Wallet execution

These tools let an AI client offer a direct wallet path. WalletConnect is the preferred
production path: the user's wallet signs and broadcasts after showing its own confirmation UI.
The local signer is disabled unless environment variables explicitly enable it.

| Tool                                      | Description                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `eightdx_walletconnect_create_session`    | Creates a WalletConnect session and returns QR/raw URI, copied URI, and mobile direct-connection options.  |
| `eightdx_walletconnect_get_session`       | Reads the current WalletConnect session and connected account, optionally waiting for a pending approval.  |
| `eightdx_walletconnect_disconnect`        | Disconnects the active WalletConnect session.                                                              |
| `eightdx_wallet_send_transaction`         | Requests `eth_sendTransaction` through the connected wallet. Requires `confirmedByUser: true`.             |
| `eightdx_local_signer_status`             | Shows whether the opt-in MCP-side signer is enabled and which address/chains are configured.               |
| `eightdx_local_sign_and_send_transaction` | Signs and broadcasts with the opt-in local signer. Requires env configuration and `confirmedByUser: true`. |

### Token discovery

| Tool                                                    | Description                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `eightdx_search_tokens`<br><sub>`GET /api/tokens`</sub> | Searches 8DX token metadata so agents can resolve prompts like "BTC", "bitcoin", "USDC", or token names. |

### Quotes and swaps

| Tool                                                                      | Description                                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `eightdx_health`<br><sub>`GET /api/health`</sub>                          | Checks whether the 8DX API is reachable and responding normally.                                                         |
| `eightdx_get_quote`<br><sub>`GET /api/{blockchain}/quote`</sub>           | Performs a read-only quote lookup for a token pair and `amountIn` or `amountInWei`.                                      |
| `eightdx_preview_market_swap`<br><sub>`GET /api/{blockchain}/quote`</sub> | Returns quote data plus a 30-second refresh hint, selected slippage/deadline, route-link metadata, and signing guidance. |
| `eightdx_get_wallet_links`                                                | Builds an 8DX web URL and MetaMask Mobile dapp deeplink for wallet handoff.                                              |
| `eightdx_create_swap`<br><sub>`POST /api/{blockchain}/swap`</sub>         | Returns swap calldata for a previously quoted path. This tool does not sign, custody funds, or broadcast by itself.      |

### Permit helpers

| Tool                                                                              | Description                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `eightdx_get_permit_address`<br><sub>`GET /api/{blockchain}/permit/address`</sub> | Reads the permit contract address used by the selected blockchain.                                     |
| `eightdx_get_permit_data`<br><sub>`GET /api/{blockchain}/permit/data`</sub>       | Returns permit data that a wallet or agent can inspect and sign externally. The server never signs it. |

### Limit orders

| Tool                                                                                                   | Description                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `eightdx_create_limit_order`<br><sub>`POST /api/{blockchain}/order`</sub>                              | Submits an order payload that has already been signed outside the MCP server.                   |
| `eightdx_get_limit_orders_by_maker`<br><sub>`GET /api/{blockchain}/orders/byMaker/{maker}`</sub>       | Reads active limit orders for a maker address.                                                  |
| `eightdx_get_limit_order_history`<br><sub>`GET /api/{blockchain}/orders/byMaker/history/{maker}`</sub> | Reads historical limit orders for a maker address.                                              |
| `eightdx_get_order_status`<br><sub>`GET /api/{blockchain}/orders/{orderHash}`</sub>                    | Reads one order by hash and returns scanner links for filled transaction hashes when available. |
| `eightdx_cancel_limit_order`<br><sub>`POST /api/{blockchain}/orders/cancel`</sub>                      | Submits a cancel payload that has already been signed outside the MCP server.                   |

### Explorer links

| Tool                          | Description                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `eightdx_build_explorer_link` | Builds Etherscan, BscScan, or Arbiscan links for transactions, addresses, and tokens. Explains off-chain order hashes. |

## Prompts

The server also exposes MCP prompt templates that help host AI agents turn natural
language into safe tool sequences:

| Prompt                         | Purpose                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `eightdx_trading_agent`        | General operating instructions for safe 8DX trading flows.                     |
| `eightdx_market_swap_scenario` | Checklist for prompts like "обменяй мне 1 биткоин по рынку".                   |
| `eightdx_limit_order_scenario` | Checklist for limit orders, signed order payloads, status, fills, and history. |

## AI trading flow

Recommended WalletConnect-first market-swap flow for an AI client:

1. Resolve or ask for the target chain before creating a WalletConnect session. If
   the user names tokens in natural language, call `eightdx_search_tokens`. If
   results are ambiguous, ask which token/address to use before quoting.
2. If the request is missing the output token, amount, slippage, or deadline, ask
   a follow-up question. For example, "обменяй мне 1 биткоин по рынку" is missing
   the token the user wants to receive. Market swap deadlines are relative
   seconds from now; use `600` for 10 minutes, not a Unix timestamp.
3. Call `eightdx_get_wallet_session` and `eightdx_walletconnect_get_session`.
4. Call `eightdx_preview_market_swap` as soon as the chain, tokens, amount,
   slippage, and deadline are known. If no wallet is connected yet, omit
   `dstAddress`. Show the quote and `routeLink.url` as an optional prefilled 8DX
   web page for users who prefer the 8DX UI; direct MCP execution can continue
   without opening that page.
5. If WalletConnect is unavailable in the current host, explain that direct
   wallet confirmation is unavailable there. Call
   `eightdx_preview_market_swap` to generate a fresh quote and route metadata,
   then offer `routeLink.url`, `walletLinks.webUrl`, or
   `walletLinks.metamaskMobileDappUrl` only as fallback web handoff links. Do not
   call `eightdx_create_swap` or `eightdx_wallet_send_transaction` in this
   fallback branch.
6. If WalletConnect is available but not connected and the user wants direct MCP
   execution, call
   `eightdx_walletconnect_create_session` for the selected chain and show all
   returned `connectionOptions`, including WalletConnect QR, copied URI, and
   mobile deeplink choices. Ask the user to connect in their wallet, then call
   `eightdx_walletconnect_get_session` again.
7. After WalletConnect connects, call `eightdx_login_wallet` with the connected
   public account, chain, surface, and wallet app when known. For normal
   self-swaps, this connected account is both `fromAddress` and `dstAddress`.
8. Refresh the quote with `eightdx_preview_market_swap` and `dstAddress` set to the connected
   wallet and show the quote, route, price impact, slippage, deadline, and
   `refreshAfterSeconds: 30`. Also show `routeLink.url` as an optional
   prefilled 8DX web page for users who prefer the 8DX UI; direct MCP execution
   can continue without opening that page.
9. Refresh the preview if the user waits longer than 30 seconds before confirming.
10. Ask for explicit confirmation of the fresh quote and swap parameters. If the
   user explicitly pre-authorizes refreshed quotes for the same swap intent, the
   agent may refresh stale quotes and continue without another chat
   confirmation; the wallet UI must still require final transaction approval.
   Then call `eightdx_create_swap` with the confirmed quoted path, slippage,
   deadline, `fromAddress`, and `dstAddress`.
11. Show the returned `to`, `data`, `value`, chain, sender, and recipient. Then
    call `eightdx_wallet_send_transaction` with `confirmedByUser: true`; the
    connected wallet signs and broadcasts only after the user approves in the
    wallet UI.
12. Use `eightdx_local_sign_and_send_transaction` only when
    `eightdx_local_signer_status` says enabled and the user explicitly asked the
    MCP server to sign and send.
13. After a transaction hash is returned, call `eightdx_build_explorer_link` so
    the terminal or Telegram bot can display a scanner link.

Recommended limit-order flow:

1. Prepare and sign the limit-order typed data outside this server.
2. Submit the signed payload with `eightdx_create_limit_order`.
3. Poll `eightdx_get_order_status` or read `eightdx_get_limit_order_history` for result,
   filters, and fill transaction hashes.

Telegram and terminal UIs should orchestrate these tools. This package does not run a
Telegram bot, but it exposes the MCP tools needed for the bot or AI host to manage wallet
connection, quote refresh, transaction confirmation, status, and history.

## Install

```bash
npm install -g @8dx/8dx-mcp-server
```

Or run it directly:

```bash
npx -y @8dx/8dx-mcp-server
```

## Configuration

| Environment variable                         | Default                            | Description                                                                   |
| -------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `EIGHTDX_API_BASE_URL`                       | `https://swap.ggp.gg`              | 8DX REST API base URL.                                                        |
| `EIGHTDX_REQUEST_TIMEOUT_MS`                 | `30000`                            | Request timeout in milliseconds.                                              |
| `EIGHTDX_WALLETCONNECT_PROJECT_ID`           | 8DX default project                | Optional WalletConnect project override. WalletConnect works out of the box.  |
| `EIGHTDX_WALLETCONNECT_RELAY_URL`            | unset                              | Optional WalletConnect relay override.                                        |
| `EIGHTDX_WALLETCONNECT_METADATA_NAME`        | `8DX MCP`                          | WalletConnect app name shown in wallets.                                      |
| `EIGHTDX_WALLETCONNECT_METADATA_DESCRIPTION` | `8DX MCP server wallet connection` | WalletConnect app description shown in wallets.                               |
| `EIGHTDX_WALLETCONNECT_METADATA_URL`         | `https://8dx.io`                   | WalletConnect app URL shown in wallets.                                       |
| `EIGHTDX_WALLETCONNECT_METADATA_ICONS`       | unset                              | Comma-separated icon URLs for WalletConnect metadata.                         |
| `EIGHTDX_ENABLE_LOCAL_SIGNER`                | `false`                            | Enables MCP-side transaction signing only when set to `true`.                 |
| `EIGHTDX_SIGNER_PRIVATE_KEY`                 | unset                              | Private key for the opt-in local signer. Never use this in an untrusted host. |
| `EIGHTDX_RPC_URL`                            | unset                              | Default Ethereum RPC URL for the local signer.                                |
| `EIGHTDX_ETHEREUM_RPC_URL`                   | unset                              | Ethereum RPC URL for the local signer. Overrides `EIGHTDX_RPC_URL`.           |
| `EIGHTDX_BSC_RPC_URL`                        | unset                              | BNB Smart Chain RPC URL for the local signer.                                 |
| `EIGHTDX_ARBITRUM_RPC_URL`                   | unset                              | Arbitrum RPC URL for the local signer.                                        |

All outgoing 8DX REST API requests include:

```http
X-Source: 8dx-mcp/0.1.0
```

This lets the 8DX backend distinguish MCP traffic from direct API usage.

## Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "8dx": {
      "command": "npx",
      "args": ["-y", "@8dx/8dx-mcp-server"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://swap.ggp.gg"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add 8dx --transport stdio -- npx -y @8dx/8dx-mcp-server
```

## OpenAI Codex

Codex CLI can register this server as a stdio MCP server with `codex mcp add`.

### Local development

Use this while developing the server before it is published to npm.

Build the server first:

```bash
cd /absolute/path/to/8dx-mcp-server
npm install
npm run build
```

Then add the local server to Codex:

```bash
codex mcp add 8dx-local \
  --env EIGHTDX_API_BASE_URL=https://swap.ggp.gg \
  --env EIGHTDX_REQUEST_TIMEOUT_MS=30000 \
  -- node /absolute/path/to/8dx-mcp-server/dist/index.js
```

Confirm that Codex can see the server:

```bash
codex mcp list
codex mcp get 8dx-local
```

### Published package

After the package is published to npm, use `npx` instead of the local `node` path:

```bash
codex mcp add 8dx \
  --env EIGHTDX_API_BASE_URL=https://swap.ggp.gg \
  --env EIGHTDX_REQUEST_TIMEOUT_MS=30000 \
  -- npx -y @8dx/8dx-mcp-server
```

## Cursor

Cursor supports project-level and global MCP configuration:

- Project-level: create `.cursor/mcp.json` in the project root.
- Global: create `~/.cursor/mcp.json`.

### Local development

Use this while developing the server before it is published to npm.

Build the server first:

```bash
cd /absolute/path/to/8dx-mcp-server
npm install
npm run build
```

Then create or update `.cursor/mcp.json` in the project where you want to use the 8DX tools:

```json
{
  "mcpServers": {
    "8dx-local": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/8dx-mcp-server/dist/index.js"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://swap.ggp.gg",
        "EIGHTDX_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

Restart Cursor, open Cursor Settings, go to MCP, and confirm that `8dx-local` is enabled.

Try these prompts in Cursor chat:

```text
Call the 8DX health tool.
```

```text
Use 8DX to get a quote on ethereum from WETH to USDC.
```

For quote testing, pass exact token identifiers and amount format accepted by the 8DX API.

### Published package

After the package is published to npm, use `npx` instead of the local `node` path:

```json
{
  "mcpServers": {
    "8dx": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@8dx/8dx-mcp-server"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://swap.ggp.gg",
        "EIGHTDX_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

If Cursor does not show the tools, run `npm run build` again, restart Cursor, and check that the
absolute path in `args` points to an existing `dist/index.js` file.

See `examples/` for ready-to-copy local MCP config templates.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run smoke:stdio
npm run smoke:agent
npm run dev
```

## Safety

This MCP server does not provide financial advice. Agents and users must inspect all swap
calldata, permit data, signatures, transaction fields, and order payloads before using them
with a wallet or broadcasting anything on-chain. Direct execution tools require
`confirmedByUser: true`; WalletConnect still relies on the user's wallet confirmation UI, and the
local signer should only be enabled in a trusted environment.

## License

MIT
