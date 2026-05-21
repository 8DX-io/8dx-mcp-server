# AI Trading Flow Design

Note: this was the first non-custodial flow design. WalletConnect and opt-in local
signer execution were added later in `2026-05-21-wallet-execution-design.md`.

## Scope

Build the first iteration inside the existing 8DX MCP server. The server remains a
non-custodial wrapper: it does not hold private keys, sign messages, broadcast
transactions, or manage Telegram sessions. It exposes safer, agent-friendly tools
that a terminal client or Telegram bot can orchestrate.

## Goals

- Let an AI agent track a user's selected wallet address and preferred wallet app in
  a local in-memory MCP session.
- Support market swap preparation with quote preview, slippage, deadline, route
  display metadata, and a 30 second quote refresh hint.
- Support limit-order status/history flows using 8DX order endpoints.
- Return wallet-signing instructions and transaction payloads instead of signing.
- Return block explorer links for transaction hashes and order fill hashes.
- Make the current 8DX API support explicit for `ethereum`, `bsc`, and `arbitrum`
  where the public OpenAPI supports them.

## Non-Goals

- No Telegram runtime, bot commands, or persistent user database in this package.
- No WalletConnect relay, deep-link signing automation, or private-key automation.
- No blockchain RPC polling unless a future API endpoint or dependency is added.
- No financial advice or automatic trade execution.

## Tool Additions

- `eightdx_login_wallet`: stores wallet address, blockchain, optional wallet app,
  and optional UI surface (`terminal`, `telegram`, or `other`) in memory.
- `eightdx_get_wallet_session`: returns the current local wallet session.
- `eightdx_logout_wallet`: clears the local wallet session.
- `eightdx_preview_market_swap`: calls 8DX quote and returns quote data plus
  `refreshAfterSeconds: 30`, selected slippage/deadline, route link metadata, and
  next signing steps.
- `eightdx_get_order_status`: reads an order by hash and returns explorer links for
  any filled transaction hashes.
- `eightdx_build_explorer_link`: creates a chain-specific block explorer URL for a
  transaction, address, token, or order hash.

Existing tools stay available. `eightdx_create_swap` remains the final calldata
builder for market swaps after a preview/quote. `eightdx_create_limit_order` and
`eightdx_cancel_limit_order` continue to require externally signed payloads.

## Data Flow

1. User connects by giving an address and wallet app. The MCP server stores only
   non-secret session metadata.
2. Agent requests a market preview. The server calls `GET /api/{blockchain}/quote`
   and returns the quote with a 30 second refresh hint.
3. User confirms slippage/deadline. Agent calls `eightdx_create_swap` with the
   selected route and user settings.
4. Wallet signing happens outside this server. The response includes `to`, `data`,
   `value`, and scanner/help links for the client to display.
5. User or client supplies a transaction hash. The agent can show explorer links.
6. For limit orders, externally signed order/cancel payloads are submitted to 8DX,
   then `eightdx_get_order_status` or history tools show state and fill hashes.

## Error Handling

Validation remains strict with Zod. API errors continue to surface status and
response body. New helper tools should return structured JSON text with `success`,
`links`, `warnings`, and `nextActions` where useful so AI clients can present clear
success/error outcomes.

## Testing

Add focused unit and integration coverage for tool registration, session lifecycle,
quote preview metadata, current chain validation, order status, explorer links, and
REST client request shapes. Run the full project checks before completion.
