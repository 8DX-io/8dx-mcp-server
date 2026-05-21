#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "8dx-agent-prompt-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: { PATH: process.env.PATH ?? "" },
  stderr: "pipe"
});

const stderrChunks = [];
transport.stderr?.on("data", (chunk) => {
  stderrChunks.push(Buffer.from(chunk).toString("utf8"));
});

try {
  await client.connect(transport);

  const prompt = await client.getPrompt({
    name: "eightdx_market_swap_scenario",
    arguments: {
      surface: "telegram",
      userRequest: "обменяй мне 1 биткоин по рынку"
    }
  });
  const promptText = prompt.messages
    .map((message) => (message.content.type === "text" ? message.content.text : ""))
    .join("\n");

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
    "fallback web handoff",
    "eightdx_local_signer_status",
    "explicit confirmation"
  ]) {
    if (!promptText.includes(requiredFragment)) {
      throw new Error(`Prompt scenario is missing: ${requiredFragment}`);
    }
  }

  const initialSession = parseToolJson(
    await client.callTool({ name: "eightdx_get_wallet_session", arguments: {} }),
    "eightdx_get_wallet_session"
  );

  if (initialSession.connected !== false) {
    throw new Error("New MCP session should start without a logged-in wallet.");
  }

  const walletConnectSession = parseToolJson(
    await client.callTool({ name: "eightdx_walletconnect_get_session", arguments: {} }),
    "eightdx_walletconnect_get_session"
  );

  if (walletConnectSession.available !== false || walletConnectSession.status !== "unavailable") {
    throw new Error("WalletConnect should be unavailable until a project ID is configured.");
  }

  const localSignerStatus = parseToolJson(
    await client.callTool({ name: "eightdx_local_signer_status", arguments: {} }),
    "eightdx_local_signer_status"
  );

  if (localSignerStatus.enabled !== false) {
    throw new Error("Local signer should be disabled by default.");
  }

  const tokenSearch = parseToolJson(
    await client.callTool({
      name: "eightdx_search_tokens",
      arguments: { blockchain: "ethereum", q: "wbtc", limit: 5, offset: 0 }
    }),
    "eightdx_search_tokens"
  );
  const wbtc = tokenSearch.data?.find?.((token) => token.symbol === "WBTC");

  if (!wbtc?.address) {
    throw new Error("Token search did not resolve WBTC on Ethereum.");
  }

  const login = parseToolJson(
    await client.callTool({
      name: "eightdx_login_wallet",
      arguments: {
        blockchain: "ethereum",
        surface: "telegram",
        walletAddress: "0x000000000000000000000000000000000000dEaD",
        walletApp: "MetaMask"
      }
    }),
    "eightdx_login_wallet"
  );

  if (!login.connected) {
    throw new Error("Wallet login did not mark the session connected.");
  }

  await sleep(1100);

  const preview = parseToolJson(
    await client.callTool({
      name: "eightdx_preview_market_swap",
      arguments: {
        blockchain: "ethereum",
        addressTokenIn: wbtc.address,
        addressTokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        amountIn: "0.0001",
        deadline: 600,
        slippageBps: 50
      }
    }),
    "eightdx_preview_market_swap"
  );

  if (preview.refreshAfterSeconds !== 30 || !preview.quote?.data?.totalAmountOut) {
    throw new Error("Preview did not return quote data with a 30 second refresh hint.");
  }

  await sleep(1100);

  const swap = parseToolJson(
    await client.callTool({
      name: "eightdx_create_swap",
      arguments: {
        blockchain: "ethereum",
        deadline: 600,
        dstAddress: "0x000000000000000000000000000000000000dEaD",
        path: preview.quote.data,
        skipSimulation: true,
        slippageBps: 50
      }
    }),
    "eightdx_create_swap"
  );

  if (typeof swap.data !== "string" || !swap.data.startsWith("0x")) {
    throw new Error("Swap creation did not return calldata.");
  }

  const walletLinks = parseToolJson(
    await client.callTool({
      name: "eightdx_get_wallet_links",
      arguments: { routeUrl: preview.routeLink.url, walletApp: "MetaMask" }
    }),
    "eightdx_get_wallet_links"
  );

  if (!walletLinks.metamaskMobileDappUrl?.startsWith("https://metamask.app.link/dapp/")) {
    throw new Error("Wallet links did not include a MetaMask dapp deeplink.");
  }

  const logout = parseToolJson(
    await client.callTool({ name: "eightdx_logout_wallet", arguments: {} }),
    "eightdx_logout_wallet"
  );

  if (logout.connected !== false) {
    throw new Error("Wallet logout did not clear the session.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        scenario: "обменяй мне 1 биткоин по рынку",
        agentInstructionChecks: {
          walletConnectFirst: true,
          checksWalletConnectSession: true,
          instructsConnectedWalletSelfSwap: true,
          resolvesTokens: true,
          asksClarifyingQuestionWhenOutputTokenMissing: true,
          previewsBeforeSwap: true,
          instructsWalletConnectExecution: true,
          keepsLocalSignerDisabledByDefault: true,
          usesWebLinksAsFallback: true
        },
        walletConnect: walletConnectSession,
        localSigner: localSignerStatus,
        token: {
          address: wbtc.address,
          symbol: wbtc.symbol
        },
        preview: {
          refreshAfterSeconds: preview.refreshAfterSeconds,
          totalAmountOut: preview.quote.data.totalAmountOut,
          routeUrl: preview.routeLink.url,
          metamaskMobileDappUrl: walletLinks.metamaskMobileDappUrl
        },
        swap: {
          calldataBytes: (swap.data.length - 2) / 2,
          minReturnAmountOut: swap.minReturnAmountOut,
          to: swap.to,
          value: swap.value
        }
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  const stderr = stderrChunks.join("").trim();
  if (stderr) {
    process.stderr.write(`${stderr}\n`);
  }
  throw error;
} finally {
  await client.close().catch(() => undefined);
}

function parseToolJson(result, toolName) {
  if (result.isError) {
    throw new Error(`${toolName} failed: ${result.content?.[0]?.text ?? "unknown error"}`);
  }

  const text = result.content?.[0]?.text;
  if (!text) {
    throw new Error(`${toolName} returned no text content.`);
  }

  return JSON.parse(text);
}
