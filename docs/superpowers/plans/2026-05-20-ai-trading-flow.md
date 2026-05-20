# AI Trading Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe AI-oriented trading flow tools to the existing 8DX MCP server.

**Architecture:** Keep the MCP server non-custodial and stateless with respect to secrets. Add an in-memory wallet session helper, richer quote preview metadata, explorer-link helpers, and order-status wrapping around existing 8DX REST endpoints. Existing REST client and tool registration patterns remain the extension points.

**Tech Stack:** TypeScript, Zod, `@modelcontextprotocol/sdk`, Vitest.

---

## File Structure

- Modify `src/types.ts` for broader blockchain support, quote `amountInWei`, session
  types, preview/status inputs, and helper client methods.
- Modify `src/rest-client.ts` to send `amountInWei` and expose order-by-hash through
  the tool layer.
- Modify `src/tools.ts` for new tool schemas, session lifecycle, preview wrappers,
  explorer links, and current blockchain enums.
- Modify `tests/tools.test.ts`, `tests/rest-client.test.ts`, and
  `tests/mcp-integration.test.ts` with red-green coverage.
- Modify `README.md` to describe the new AI flow and safety boundary.

### Task 1: Current Chain And Quote Inputs

- [x] **Step 1: Write failing tests**

Add tests that expect `ethereum`, `bsc`, and `arbitrum` to be accepted for quote,
swap, permit, and limit-order tools, and that `amountInWei` is forwarded to
`GET /quote`.

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/tools.test.ts tests/rest-client.test.ts`
Expected: failing assertions for unsupported chains and missing `amountInWei`.

- [x] **Step 3: Implement minimal code**

Update blockchain enums/types and quote request query construction.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/tools.test.ts tests/rest-client.test.ts`
Expected: pass.

### Task 2: Wallet Session Tools

- [x] **Step 1: Write failing tests**

Add tests for `eightdx_login_wallet`, `eightdx_get_wallet_session`, and
`eightdx_logout_wallet`.

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/tools.test.ts tests/mcp-integration.test.ts`
Expected: missing tool names.

- [x] **Step 3: Implement minimal code**

Add in-memory session state inside `createEightDxToolDefinitions` closure and
register the three tools.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/tools.test.ts tests/mcp-integration.test.ts`
Expected: pass.

### Task 3: Market Preview And Explorer Helpers

- [x] **Step 1: Write failing tests**

Add tests for `eightdx_preview_market_swap`, `eightdx_get_order_status`, and
`eightdx_build_explorer_link`, including route refresh metadata and fill-hash links.

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/tools.test.ts tests/rest-client.test.ts`
Expected: missing tool names or missing metadata.

- [x] **Step 3: Implement minimal code**

Wrap quote/order-by-hash calls and build deterministic explorer URLs.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/tools.test.ts tests/rest-client.test.ts`
Expected: pass.

### Task 4: Docs And Full Verification

- [x] **Step 1: Update README**

Document new tools, AI flow, quote refresh, signing boundary, and current chains.

- [x] **Step 2: Run full checks**

Run: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
Expected: all commands exit 0.
