# WalletConnect-First Swap Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WalletConnect direct execution the default guided market-swap path, with 8DX web links kept as explicit fallback.

**Architecture:** This is a behavior-guidance change over existing MCP primitives. Update prompt templates, tool output hints, smoke checks, and README flow text so MCP hosts consistently connect a wallet through WalletConnect, use the connected account as both sender and destination for self-swaps, quote first, then request wallet confirmation.

**Tech Stack:** TypeScript, MCP SDK prompt/tool registration, Zod tool schemas, Vitest, Node smoke scripts, Markdown documentation.

---

## File Structure

- Modify `src/prompts.ts`: make `eightdx_trading_agent` and `eightdx_market_swap_scenario` WalletConnect-first for market swaps.
- Modify `src/tools.ts`: tighten `eightdx_preview_market_swap.nextActions`, `presentationHints`, and fallback wallet-link instructions.
- Modify `tests/mcp-integration.test.ts`: assert prompt text describes WalletConnect-first behavior and connected-wallet self-swap destination.
- Modify `tests/tools.test.ts`: assert preview and wallet links expose direct execution versus fallback semantics.
- Modify `scripts/smoke-agent-prompts.mjs`: keep runtime prompt smoke aligned with the new WalletConnect-first flow.
- Modify `README.md`: update the recommended market-swap flow and configuration guidance.

Do not change WalletConnect transport internals in `src/wallet-execution.ts` unless a test reveals an existing bug. The current implementation already creates sessions, reads connected accounts, and submits `eth_sendTransaction`.

Before starting implementation, run `git status --short`. This repository currently has unrelated uncommitted work. Do not revert it. Stage and commit only the files listed in each task.

---

### Task 1: Lock Prompt Requirements With Tests

**Files:**
- Modify: `tests/mcp-integration.test.ts`
- Modify: `scripts/smoke-agent-prompts.mjs`

- [ ] **Step 1: Update integration prompt assertions first**

In `tests/mcp-integration.test.ts`, replace the final assertions inside `it("exposes prompt scenarios that guide natural-language trading requests", ...)` with these stricter checks:

```ts
      expect(text).toContain("eightdx_get_wallet_session");
      expect(text).toContain("eightdx_walletconnect_get_session");
      expect(text).toContain("eightdx_walletconnect_create_session");
      expect(text).toContain("WalletConnect-first");
      expect(text).toContain("connected WalletConnect account as the wallet session");
      expect(text).toContain("fromAddress and dstAddress to the connected wallet");
      expect(text).toContain("eightdx_search_tokens");
      expect(text).toContain("Ask a follow-up question");
      expect(text).toContain("eightdx_preview_market_swap");
      expect(text).toContain("explicit confirmation");
      expect(text).toContain("eightdx_create_swap");
      expect(text).toContain("eightdx_wallet_send_transaction");
      expect(text).toContain("fallback");
      expect(text).toContain("do not sign");
```

- [ ] **Step 2: Update smoke prompt checks**

In `scripts/smoke-agent-prompts.mjs`, replace the `requiredFragment` array near the top with:

```js
  for (const requiredFragment of [
    "WalletConnect-first",
    "eightdx_get_wallet_session",
    "eightdx_walletconnect_get_session",
    "eightdx_walletconnect_create_session",
    "connected WalletConnect account as the wallet session",
    "fromAddress and dstAddress to the connected wallet",
    "eightdx_search_tokens",
    "Ask a follow-up question",
    "eightdx_preview_market_swap",
    "eightdx_create_swap",
    "eightdx_wallet_send_transaction",
    "fallback",
    "eightdx_local_signer_status",
    "explicit confirmation"
  ]) {
```

- [ ] **Step 3: Run the targeted prompt tests and verify they fail**

Run:

```bash
npm test -- tests/mcp-integration.test.ts
```

Expected: FAIL because the current prompt text does not yet include `WalletConnect-first`, `eightdx_walletconnect_get_session`, and connected-wallet self-swap wording.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/mcp-integration.test.ts scripts/smoke-agent-prompts.mjs
git commit -m "test: require WalletConnect-first swap prompts"
```

---

### Task 2: Make Prompt Templates WalletConnect-First

**Files:**
- Modify: `src/prompts.ts`
- Test: `tests/mcp-integration.test.ts`
- Test: `scripts/smoke-agent-prompts.mjs`

- [ ] **Step 1: Update `createTradingAgentPrompt` safety rules**

In `src/prompts.ts`, replace the `Safety rules:` block in `createTradingAgentPrompt` with:

```ts
    "Safety rules:",
    "- Do not claim to hold wallet keys. Do not sign or broadcast unless the user explicitly confirmed a prepared transaction and an execution tool is available.",
    "- Market swaps are WalletConnect-first. Call eightdx_get_wallet_session and eightdx_walletconnect_get_session before asking for a manual wallet address.",
    "- If no WalletConnect account is connected for the requested chain, call eightdx_walletconnect_create_session and show the URI/deeplink so the user can connect their wallet.",
    "- After WalletConnect connects, treat the connected WalletConnect account as the wallet session. Call eightdx_login_wallet with that public address, chain, surface, and wallet app when known.",
    "- For normal self-swaps, use the connected WalletConnect account as both fromAddress and dstAddress. Ask before using any different recipient.",
    "- If WalletConnect is unavailable, explain that direct wallet confirmation requires EIGHTDX_WALLETCONNECT_PROJECT_ID, then offer wallet handoff links only as a fallback.",
    "- If the user's request names tokens by symbol or common name, call eightdx_search_tokens before quoting.",
    "- If the request is missing sell token, buy token, amount, chain, slippage, or deadline, ask a follow-up question before creating calldata.",
    "- Always show a quote first with eightdx_preview_market_swap. Refresh it if older than 30 seconds.",
    "- Only after explicit user confirmation call eightdx_create_swap with the confirmed quote path, slippage, deadline, and the connected wallet as both sender and destination for self-swaps.",
    "- Show the transaction fields, then call eightdx_wallet_send_transaction with confirmedByUser true so the connected wallet can display, sign, and broadcast after the user approves.",
    "- Use eightdx_local_sign_and_send_transaction only when eightdx_local_signer_status says enabled and the user explicitly asks this MCP server to sign and send.",
    "- For limit orders, use only externally signed order payloads with eightdx_create_limit_order or externally signed cancel payloads with eightdx_cancel_limit_order.",
    "- For status and history, use eightdx_get_order_status, eightdx_get_limit_orders_by_maker, eightdx_get_limit_order_history, and scanner links.",
```

- [ ] **Step 2: Replace the market swap scenario checklist**

In `src/prompts.ts`, replace the `Market swap scenario:` numbered list in `createMarketSwapScenarioPrompt` with:

```ts
    "Market swap scenario:",
    "1. WalletConnect-first: call eightdx_get_wallet_session and eightdx_walletconnect_get_session.",
    "2. If no WalletConnect session is connected, call eightdx_walletconnect_create_session for the requested or default chain and show the URI/deeplink. Ask the user to connect in their wallet.",
    "3. After the user connects, call eightdx_walletconnect_get_session again with a wait window. Treat the connected WalletConnect account as the wallet session, then call eightdx_login_wallet with that public address, chain, surface, and wallet app when known.",
    "4. Parse the request. For 'bitcoin' or 'BTC', call eightdx_search_tokens; prefer WBTC only after showing the resolved token and chain to the user.",
    "5. If the output token is missing, Ask a follow-up question such as 'What do you want to receive: USDC, ETH, USDT, or another token?'",
    "6. If amount, chain, slippage, or deadline are missing, ask for them or use a conservative default only after telling the user.",
    "7. Call eightdx_preview_market_swap with dstAddress set to the connected wallet. Show the quote, expected output, price impact if present, refreshAfterSeconds, slippage, deadline, route, and WalletConnect execution context.",
    "8. Refresh the preview if it is older than 30 seconds before asking for transaction confirmation.",
    "9. Ask for explicit confirmation after the fresh quote and before creating calldata.",
    "10. Call eightdx_create_swap with the quoted path, slippage, deadline, and fromAddress and dstAddress to the connected wallet for a self-swap unless the user explicitly requested another recipient.",
    "11. Show the transaction fields returned by eightdx_create_swap: to, data, value, chain, sender, and recipient.",
    "12. Call eightdx_wallet_send_transaction with confirmedByUser true; the connected wallet signs and broadcasts only after the user approves in the wallet UI.",
    "13. After a transaction hash is returned, call eightdx_build_explorer_link for the scanner URL.",
    "14. If WalletConnect is unavailable, say direct wallet confirmation requires EIGHTDX_WALLETCONNECT_PROJECT_ID and offer walletLinks.metamaskMobileDappUrl/webUrl or routeLink.url as fallback web handoff links.",
    "15. Use eightdx_local_sign_and_send_transaction only if eightdx_local_signer_status is enabled and the user explicitly requested MCP-side signing. Otherwise do not sign inside the MCP server.",
```

Keep the existing final line:

```ts
    "Never skip the quote or the explicit confirmation step."
```

- [ ] **Step 3: Run prompt tests**

Run:

```bash
npm test -- tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Build and run prompt smoke**

Run:

```bash
npm run build
npm run smoke:agent
```

Expected: both PASS. `smoke:agent` should still report WalletConnect unavailable by default unless `EIGHTDX_WALLETCONNECT_PROJECT_ID` is configured.

- [ ] **Step 5: Commit prompt implementation**

```bash
git add src/prompts.ts
git commit -m "feat: make swap prompts WalletConnect-first"
```

---

### Task 3: Lock Tool Output Guidance With Tests

**Files:**
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Add preview next-action assertions**

In `tests/tools.test.ts`, inside `it("previews market swaps with quote refresh metadata and an 8DX route link", ...)`, extend the existing `expect(result).toMatchObject(...)` block with these fields:

```ts
      nextActions: expect.arrayContaining([
        expect.stringContaining("WalletConnect"),
        expect.stringContaining("connected wallet as both sender and destination"),
        expect.stringContaining("eightdx_wallet_send_transaction")
      ]),
      presentationHints: {
        telegram: expect.stringContaining("WalletConnect"),
        terminal: expect.stringContaining("WalletConnect")
      },
```

The full relevant expected object should include the existing `quote`, `refreshAfterSeconds`, `selectedExecution`, `wallet`, and `walletLinks` checks plus the new `nextActions` and `presentationHints` checks.

- [ ] **Step 2: Tighten wallet-link fallback assertions**

In `tests/tools.test.ts`, inside `it("builds wallet handoff links for MetaMask and web fallback", ...)`, replace the `instructions` expectation with:

```ts
      instructions: expect.arrayContaining([
        expect.stringContaining("fallback"),
        expect.stringContaining("WalletConnect"),
        expect.stringContaining("webUrl"),
        expect.stringContaining("MetaMask Mobile")
      ]),
      walletConnectNote: expect.stringContaining("EIGHTDX_WALLETCONNECT_PROJECT_ID")
```

- [ ] **Step 3: Run targeted tool tests and verify they fail**

Run:

```bash
npm test -- tests/tools.test.ts
```

Expected: FAIL because current `nextActions`, `presentationHints`, and wallet-link instructions do not yet use the required WalletConnect-first/fallback wording.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/tools.test.ts
git commit -m "test: require WalletConnect-first tool guidance"
```

---

### Task 4: Update Preview and Fallback Link Guidance

**Files:**
- Modify: `src/tools.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Update preview `nextActions` and `presentationHints`**

In `src/tools.ts`, inside the `eightdx_preview_market_swap` handler, replace the `nextActions` and `presentationHints` object with:

```ts
          nextActions: [
            "Refresh this preview if it is older than 30 seconds before asking the user to confirm.",
            "For WalletConnect-first execution, use the connected wallet as both sender and destination for a normal self-swap unless the user explicitly requested another recipient.",
            "After explicit user confirmation, call eightdx_create_swap with the quoted path, slippage, deadline, fromAddress, and destination wallet.",
            "Display the returned transaction payload, then call eightdx_wallet_send_transaction with confirmedByUser true so the connected wallet can request final approval."
          ],
          presentationHints: {
            telegram:
              "Show the quote summary, WalletConnect status, connected-wallet recipient, slippage, deadline, and a wallet confirmation action.",
            terminal:
              "Print the quote summary, WalletConnect status, connected-wallet sender/recipient, route link, and exact transaction fields before asking for confirmation."
          }
```

- [ ] **Step 2: Update fallback wallet-link instructions**

In `src/tools.ts`, replace the `instructions` and `walletConnectNote` values in `buildWalletLinks` with:

```ts
    instructions: [
      "These are fallback web handoff links for when WalletConnect direct confirmation is unavailable or the user explicitly chooses the 8DX UI.",
      "Open the webUrl in a browser with your wallet extension, or open the MetaMask Mobile dapp URL on mobile.",
      "The wallet or 8DX page must show the final transaction details; the user must review and confirm manually."
    ],
```

and:

```ts
    walletConnectNote:
      "Direct MCP wallet confirmation requires WalletConnect. Configure EIGHTDX_WALLETCONNECT_PROJECT_ID and use eightdx_walletconnect_create_session when the host can display a WalletConnect URI.",
```

- [ ] **Step 3: Run targeted tool tests**

Run:

```bash
npm test -- tests/tools.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit tool guidance implementation**

```bash
git add src/tools.ts
git commit -m "feat: guide swaps through WalletConnect execution"
```

---

### Task 5: Update README Flow and Smoke Scenario

**Files:**
- Modify: `README.md`
- Modify: `scripts/smoke-agent-prompts.mjs`

- [ ] **Step 1: Replace the README market-swap flow**

In `README.md`, replace the `## AI trading flow` market-swap numbered list with:

```md
Recommended WalletConnect-first market-swap flow for an AI client:

1. Call `eightdx_get_wallet_session` and `eightdx_walletconnect_get_session`.
2. If WalletConnect is not connected, call `eightdx_walletconnect_create_session`
   for the selected chain and show the URI/deeplink. Ask the user to connect in
   their wallet, then call `eightdx_walletconnect_get_session` again.
3. After WalletConnect connects, call `eightdx_login_wallet` with the connected
   public account, chain, surface, and wallet app when known. For normal
   self-swaps, this connected account is both `fromAddress` and `dstAddress`.
4. If the user names tokens in natural language, call `eightdx_search_tokens`. If
   results are ambiguous, ask which token/address to use before quoting.
5. If the request is missing the output token, chain, amount, slippage, or
   deadline, ask a follow-up question. For example, "обменяй мне 1 биткоин по
   рынку" is missing the token the user wants to receive.
6. Call `eightdx_preview_market_swap` with `dstAddress` set to the connected
   wallet and show the quote, route, price impact, slippage, deadline, and
   `refreshAfterSeconds: 30`.
7. Refresh the preview if the user waits longer than 30 seconds before confirming.
8. Ask for explicit confirmation after the fresh quote. Then call
   `eightdx_create_swap` with the confirmed quoted path, slippage, deadline,
   `fromAddress`, and `dstAddress`.
9. Show the returned `to`, `data`, `value`, chain, sender, and recipient. Then
   call `eightdx_wallet_send_transaction` with `confirmedByUser: true`; the
   connected wallet signs and broadcasts only after the user approves in the
   wallet UI.
10. If WalletConnect is unavailable, explain that direct wallet confirmation
    requires `EIGHTDX_WALLETCONNECT_PROJECT_ID`. Offer `routeLink.url`,
    `walletLinks.webUrl`, or `walletLinks.metamaskMobileDappUrl` only as fallback
    web handoff links.
11. Use `eightdx_local_sign_and_send_transaction` only when
    `eightdx_local_signer_status` says enabled and the user explicitly asked the
    MCP server to sign and send.
12. After a transaction hash is returned, call `eightdx_build_explorer_link` so
    the terminal or Telegram bot can display a scanner link.
```

Keep the existing recommended limit-order flow below this section.

- [ ] **Step 2: Update smoke output labels**

In `scripts/smoke-agent-prompts.mjs`, update the `agentInstructionChecks` object to:

```js
        agentInstructionChecks: {
          walletConnectFirst: true,
          checksWalletConnectSession: true,
          usesConnectedWalletForSelfSwap: true,
          resolvesTokens: true,
          asksClarifyingQuestionWhenOutputTokenMissing: true,
          previewsBeforeSwap: true,
          supportsWalletConnectExecution: true,
          keepsLocalSignerDisabledByDefault: true,
          usesWebLinksAsFallback: true
        },
```

- [ ] **Step 3: Run README-adjacent smoke verification**

Run:

```bash
npm run build
npm run smoke:agent
```

Expected: PASS and stdout includes `"walletConnectFirst": true` and `"usesWebLinksAsFallback": true`.

- [ ] **Step 4: Commit docs and smoke updates**

```bash
git add README.md scripts/smoke-agent-prompts.mjs
git commit -m "docs: document WalletConnect-first swap flow"
```

---

### Task 6: Full Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:stdio
npm run smoke:agent
```

Expected: all commands PASS. `smoke:agent` may call live 8DX quote endpoints; if it fails because the external API is unavailable, record the exact error and rerun once.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status --short
git diff -- src/prompts.ts src/tools.ts tests/mcp-integration.test.ts tests/tools.test.ts scripts/smoke-agent-prompts.mjs README.md
```

Expected: only intentional changes in the listed files. Unrelated pre-existing work may still appear in `git status`; do not revert it.

- [ ] **Step 3: Commit any verification-only fixes**

If full verification required small fixes, commit only those touched files:

```bash
git add src/prompts.ts src/tools.ts tests/mcp-integration.test.ts tests/tools.test.ts scripts/smoke-agent-prompts.mjs README.md
git commit -m "fix: align WalletConnect-first swap flow checks"
```

If no fixes were needed after Task 5, skip this commit.

---

## Self-Review Notes

- Spec coverage: prompt behavior, connected-wallet destination semantics, fallback links, explicit confirmation, quote refresh, docs, and tests are each covered by a task.
- Scope: this plan does not add new wallet transports or UI surfaces; it only updates scenario guidance and output hints over existing tools.
- Type consistency: no new TypeScript public types are introduced. All new assertions target existing properties: `nextActions`, `presentationHints`, `walletLinks.instructions`, and `walletLinks.walletConnectNote`.
