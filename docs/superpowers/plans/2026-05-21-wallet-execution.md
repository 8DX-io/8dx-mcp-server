# Wallet Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WalletConnect execution and opt-in local signer transaction sending to the 8DX MCP server.

**Architecture:** Keep 8DX REST tools separate from wallet execution. Add small wallet adapter interfaces that can be faked in tests and backed by WalletConnect/viem in production. Register execution tools alongside existing 8DX tools, and update prompts/docs so agents prefer WalletConnect and only use local signing when explicitly enabled.

**Tech Stack:** TypeScript, Zod, MCP SDK, WalletConnect Sign Client, viem, Vitest.

---

## File Structure

- Create `src/wallet-execution.ts` for wallet adapter interfaces, no-op defaults, WalletConnect adapter, and local signer adapter.
- Modify `src/config.ts` and `src/types.ts` for wallet execution config and transaction input types.
- Modify `src/server.ts` and `src/tools.ts` to register wallet execution tools.
- Modify `src/prompts.ts` and `README.md` for the new flow.
- Modify tests and smoke scripts to cover fake adapters and disabled defaults.

### Task 1: Wallet Adapter Contract

- [x] **Step 1: Write failing tests**

Add unit/integration tests expecting wallet execution tools, disabled default status, fake WalletConnect session creation, fake wallet send, and local signer confirmation gating.

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/tools.test.ts tests/mcp-integration.test.ts`
Expected: fail because wallet execution tools do not exist.

- [x] **Step 3: Implement minimal adapter and tools**

Create wallet execution interfaces, disabled defaults, tool registration, and fake-friendly injection.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/tools.test.ts tests/mcp-integration.test.ts`
Expected: pass.

### Task 2: Production Backends

- [x] **Step 1: Write failing tests**

Add config/rest-free unit tests for WalletConnect project ID config and local signer env gating.

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/config.test.ts`
Expected: fail because config fields are missing.

- [x] **Step 3: Implement WalletConnect and local signer backends**

Install dependencies, parse env, initialize WalletConnect only when configured, and initialize local signer only when explicitly enabled.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/config.test.ts tests/tools.test.ts`
Expected: pass.

### Task 3: Agent Scenarios And Runtime Smoke

- [x] **Step 1: Update prompt/docs/smoke tests**

Update prompts, README, and smoke scripts to expose WalletConnect, fallback links, and local signer boundaries.

- [x] **Step 2: Run full verification**

Run: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run smoke:stdio`, and `npm run smoke:agent`.
Expected: all exit 0.
