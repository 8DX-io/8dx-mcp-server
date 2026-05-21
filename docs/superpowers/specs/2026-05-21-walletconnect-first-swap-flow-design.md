# WalletConnect-First Market Swap Flow

## Context

8DX MCP already exposes the primitives needed for a non-custodial market swap:
wallet session metadata, token search, quote preview, swap calldata creation,
WalletConnect session creation, WalletConnect transaction requests, and fallback
8DX wallet links. The missing product behavior is a strict, repeatable assistant
scenario that guides users through direct wallet confirmation by default.

The default market-swap scenario should no longer treat the 8DX web link as the
primary completion path. The primary path is WalletConnect: the MCP host creates
a WalletConnect connection request, the user connects their wallet, the assistant
quotes the requested swap, asks for explicit confirmation, then sends the
prepared transaction request to the connected wallet for final user approval.

## Goals

- Make WalletConnect direct execution the default market-swap path.
- Use the connected wallet address as both `fromAddress` and `dstAddress` for
  normal self-swaps.
- Keep the flow non-custodial: MCP never stores private keys, signs by default,
  or broadcasts without wallet approval.
- Give users one clear route from "I want to swap" to "open wallet and confirm".
- Keep 8DX web and MetaMask dapp links as explicit fallback links when
  WalletConnect is unavailable or the user asks to finish in the 8DX UI.

## Non-Goals

- Do not add MCP-side private-key signing as a default or recommended path.
- Do not remove existing route links or web handoff support.
- Do not implement a Telegram bot, browser extension, or standalone UI.
- Do not assume MCP can read a wallet extension's connected account without
  WalletConnect or an explicit public address.

## User Flow

1. Check local wallet metadata with `eightdx_get_wallet_session`.
2. Check direct wallet connection with `eightdx_walletconnect_get_session`.
3. If WalletConnect is not connected, call
   `eightdx_walletconnect_create_session` for the target chain and show the
   WalletConnect URI plus wallet deeplinks, including MetaMask when available.
4. Ask the user to connect the wallet, then call
   `eightdx_walletconnect_get_session` again with a wait window.
5. After connection, call `eightdx_login_wallet` using the connected public
   wallet address, selected chain, surface, and wallet app when known.
6. Parse or ask for missing swap inputs: sell token, buy token, amount, chain,
   slippage, and deadline.
7. Resolve token symbols or common names with `eightdx_search_tokens`; ask the
   user to choose when results are ambiguous.
8. Call `eightdx_preview_market_swap` with the resolved pair, amount, slippage,
   deadline, and `dstAddress` set to the connected wallet address.
9. Show the quote, expected output, minimum output implied by slippage when
   available, route, price impact, refresh window, and execution settings.
10. Refresh the quote if it is older than `refreshAfterSeconds`.
11. Ask for explicit confirmation before creating or sending a transaction.
12. Call `eightdx_create_swap` with the confirmed quote path, slippage, deadline,
    `fromAddress` equal to the connected wallet, and `dstAddress` equal to the
    same connected wallet unless the user explicitly requested another recipient.
13. Show the transaction target, value, calldata summary, chain, and recipient.
14. Call `eightdx_wallet_send_transaction` with `confirmedByUser: true`; the
    connected wallet displays the final confirmation and signs/broadcasts only
    after the user approves in the wallet.
15. After a transaction hash is returned, call `eightdx_build_explorer_link` and
    show the scanner URL.

## Fallback Behavior

If WalletConnect is disabled or unavailable, the assistant should say that direct
wallet confirmation requires `EIGHTDX_WALLETCONNECT_PROJECT_ID`. It may then
offer the fallback route links from `eightdx_preview_market_swap` or
`eightdx_get_wallet_links`:

- `walletLinks.webUrl` for a browser with a wallet extension.
- `walletLinks.metamaskMobileDappUrl` for MetaMask Mobile.
- `routeLink.url` for the prefilled 8DX web route.

The fallback must be presented as a web handoff, not as direct MCP execution.

## Prompt Changes

The trading-agent and market-swap scenario prompts should instruct hosts to:

- Prefer WalletConnect direct execution for market swaps.
- Create a WalletConnect session before collecting a manual wallet address when
  the user's intent is direct wallet confirmation.
- Treat the connected WalletConnect account as the user's wallet session.
- Use the connected wallet as the default destination for self-swaps.
- Ask for explicit confirmation after a fresh quote and before
  `eightdx_create_swap`.
- Call `eightdx_wallet_send_transaction` only after transaction fields are
  prepared and the user has confirmed.
- Expose 8DX web links only as fallback or when the user explicitly chooses the
  8DX UI.

## Tool Output Changes

The existing tools are sufficient for the first implementation. Small output
additions may improve host behavior without changing the API shape:

- `eightdx_preview_market_swap.nextActions` should mention WalletConnect-first
  execution and self-swap destination semantics.
- `walletLinks.instructions` should clearly mark links as fallback/web handoff.
- README examples should show the WalletConnect-first order of tool calls.

## Error Handling

- If WalletConnect connection remains pending, tell the user to approve the
  connection in their wallet and retry `eightdx_walletconnect_get_session`.
- If the connected chain differs from the requested chain, ask the user to switch
  or restart WalletConnect for the requested chain.
- If token search is ambiguous, ask the user to choose an exact token/address
  before quoting.
- If the quote expires, refresh before requesting transaction confirmation.
- If transaction submission fails, show the wallet error and keep the latest
  quote state clear so the user can retry after refreshing.

## Testing

Unit and integration tests should cover:

- Prompt text requiring WalletConnect-first market swaps.
- Preview output next actions explaining connected-wallet destination behavior.
- README or smoke scenario examples showing the full WalletConnect-first flow.
- Existing disabled WalletConnect behavior remains explicit and safe.
- Existing fallback wallet links remain available.
