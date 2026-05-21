# Wallet Execution Design

## Scope

Add wallet execution support to the 8DX MCP server without making private-key custody
the default behavior. The production path is WalletConnect: the MCP server creates a
pairing URI/deeplink, the user connects a wallet, and transaction requests are sent
to the wallet with `eth_sendTransaction`. The user still confirms in the wallet UI.

Add a separate local signer mode for controlled environments only. It is disabled by
default and requires explicit environment variables before the MCP server will sign or
broadcast anything itself.

## Goals

- Let an AI agent offer wallet connection through WalletConnect URI/deeplink.
- Let an AI agent inspect current WalletConnect session/account state.
- Let an AI agent request wallet-side signing/broadcast for prepared swap calldata.
- Keep web/deeplink fallback for users who want to finish in the 8DX site.
- Provide local signer status and sign/send tools, gated behind explicit opt-in.
- Make prompts prefer WalletConnect, fall back to links, and only use local signer
  when the user and environment explicitly allow it.

## Non-Goals

- No seed phrase handling.
- No default private-key storage.
- No hidden transaction signing.
- No automatic trading without quote preview and explicit user confirmation.

## New Tools

- `eightdx_walletconnect_create_session`
- `eightdx_walletconnect_get_session`
- `eightdx_walletconnect_disconnect`
- `eightdx_wallet_send_transaction`
- `eightdx_local_signer_status`
- `eightdx_local_sign_and_send_transaction`

## Safety Rules

- WalletConnect requests use `eth_sendTransaction`; the wallet signs and broadcasts
  only after user confirmation.
- Local signer tools require `EIGHTDX_ENABLE_LOCAL_SIGNER=true`, a private key, and
  a chain RPC URL.
- Transaction send tools require an explicit `confirmedByUser: true` input.
- Agents must show `to`, `data`, `value`, chain, slippage/deadline context, and quote
  age before requesting a send.

## Testing

Use fake WalletConnect and signer adapters in unit/integration tests. Runtime smoke
can verify tool exposure and disabled local signer status without requiring a real
WalletConnect project ID or private key.
