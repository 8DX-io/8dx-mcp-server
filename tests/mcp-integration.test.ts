import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { createEightDxMcpServer } from "../src/server.js";
import type { EightDxClient } from "../src/types.js";

function createClientStub(): EightDxClient {
  return {
    cancelLimitOrder: async () => ({ success: true }),
    createLimitOrder: async () => ({ success: true }),
    createSwap: async () => ({ data: "0xcalldata", minReturnAmountOut: "1" }),
    getHealth: async () => "ok",
    getLimitOrderByHash: async () => ({ data: { orderHash: "0xorder" } }),
    getLimitOrderHistory: async () => ({ data: [] }),
    getLimitOrdersByMaker: async () => ({ data: [] }),
    getPermitAddress: async () => ({ data: "0xpermit" }),
    getPermitData: async () => ({ alreadyApproved: false, alreadyPermit: false }),
    getQuote: async () => ({ data: { totalAmountOut: "2" } }),
    searchTokens: async (input) => ({ data: [{ address: "0xBtc", symbol: "WBTC" }], input })
  };
}

function createWalletExecutionStub() {
  return {
    walletConnect: {
      createSession: async () => ({
        available: true,
        status: "pending",
        uri: "wc:test"
      }),
      disconnect: async () => ({ connected: false, status: "disconnected" }),
      getSession: async () => ({
        address: "0xWallet",
        connected: true,
        status: "connected"
      }),
      sendTransaction: async () => ({
        mode: "walletconnect",
        txHash: "0xWalletConnectTx"
      })
    },
    localSigner: {
      getStatus: () => ({ enabled: false, reason: "disabled by test" }),
      signAndSendTransaction: async () => ({
        mode: "local-signer",
        txHash: "0xLocalSignerTx"
      })
    }
  };
}

describe("8DX MCP server integration", () => {
  it("lists and calls tools over an MCP transport", async () => {
    const server = createEightDxMcpServer({
      client: createClientStub(),
      walletExecution: createWalletExecutionStub()
    });
    const client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("eightdx_get_quote");

      const result = await client.callTool({
        arguments: {},
        name: "eightdx_health"
      });

      expect(result.content).toEqual([{ type: "text", text: '"ok"' }]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("calls every registered tool over an MCP transport and returns JSON text content", async () => {
    const server = createEightDxMcpServer({
      client: createClientStub(),
      walletExecution: createWalletExecutionStub()
    });
    const client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const limitOrderParams = {
        makerTraits: {
          allowMultipleFills: false,
          allowPartialFills: false,
          allowedSenderSuffix: "0x",
          expiration: 0,
          hasExtension: false,
          needCheckEpochManager: false,
          needPostInteractionCall: false,
          needPreInteractionCall: false,
          nonceOrEpoch: 1,
          series: 0,
          unwrapWeth: false,
          usePermit2: false
        },
        makingAmount: "100",
        salt: "1",
        signature: "0xsignature",
        takingAmount: "200"
      };
      const swapPath = {
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountIn: "100",
        steps: [],
        totalAmountOut: "200",
        totalPriceImpact: 0
      };

      const cases = [
        {
          arguments: {},
          name: "eightdx_health",
          expected: "ok"
        },
        {
          arguments: {
            blockchain: "ethereum",
            surface: "terminal",
            walletAddress: "0xWallet",
            walletApp: "Rabby"
          },
          name: "eightdx_login_wallet",
          expected: { connected: true, session: { walletAddress: "0xWallet" } }
        },
        {
          arguments: {},
          name: "eightdx_get_wallet_session",
          expected: { connected: true, session: { walletAddress: "0xWallet" } }
        },
        {
          arguments: { blockchain: "ethereum", q: "btc" },
          name: "eightdx_search_tokens",
          expected: { data: [{ address: "0xBtc", symbol: "WBTC" }] }
        },
        {
          arguments: {
            blockchain: "ethereum",
            addressTokenIn: "0xIn",
            addressTokenOut: "0xOut",
            amountIn: "100"
          },
          name: "eightdx_get_quote",
          expected: { data: { totalAmountOut: "2" } }
        },
        {
          arguments: {
            blockchain: "ethereum",
            addressTokenIn: "0xIn",
            addressTokenOut: "0xOut",
            amountIn: "100",
            dstAddress: "0xWallet",
            slippageBps: 50
          },
          name: "eightdx_preview_market_swap",
          expected: { refreshAfterSeconds: 30, selectedExecution: { slippageBps: 50 } }
        },
        {
          arguments: { routeUrl: "https://8dx.io/swap?blockchain=ethereum" },
          name: "eightdx_get_wallet_links",
          expected: {
            metamaskMobileDappUrl: "https://metamask.app.link/dapp/8dx.io/swap?blockchain=ethereum"
          }
        },
        {
          arguments: {
            blockchain: "ethereum",
            dstAddress: "0xWallet",
            path: swapPath
          },
          name: "eightdx_create_swap",
          expected: { data: "0xcalldata", minReturnAmountOut: "1" }
        },
        {
          arguments: { blockchain: "ethereum" },
          name: "eightdx_get_permit_address",
          expected: { data: "0xpermit" }
        },
        {
          arguments: {
            blockchain: "bsc",
            addressTokenIn: "0xIn",
            dstAddress: "0xWallet",
            amountIn: "100"
          },
          name: "eightdx_get_permit_data",
          expected: { alreadyApproved: false, alreadyPermit: false }
        },
        {
          arguments: {
            blockchain: "ethereum",
            maker: "0xMaker",
            makerSrcOrToken: "0xIn",
            orderType: "limit",
            params: limitOrderParams,
            takerSrcOrToken: "0xOut"
          },
          name: "eightdx_create_limit_order",
          expected: { success: true }
        },
        {
          arguments: { blockchain: "ethereum", maker: "0xMaker" },
          name: "eightdx_get_limit_orders_by_maker",
          expected: { data: [] }
        },
        {
          arguments: { blockchain: "ethereum", maker: "0xMaker", limit: 10 },
          name: "eightdx_get_limit_order_history",
          expected: { data: [] }
        },
        {
          arguments: { blockchain: "ethereum", orderHash: "0xOrder" },
          name: "eightdx_get_order_status",
          expected: { order: { data: { orderHash: "0xorder" } } }
        },
        {
          arguments: { blockchain: "ethereum", value: "0xTx", valueType: "transaction" },
          name: "eightdx_build_explorer_link",
          expected: { url: "https://etherscan.io/tx/0xTx" }
        },
        {
          arguments: {
            blockchain: "ethereum",
            deadline: 1_700_000_000,
            maker: "0xMaker",
            orderHash: "0xOrder",
            signature: "0xsignature"
          },
          name: "eightdx_cancel_limit_order",
          expected: { success: true }
        },
        {
          arguments: {},
          name: "eightdx_logout_wallet",
          expected: { connected: false, previousSession: { walletAddress: "0xWallet" } }
        },
        {
          arguments: { blockchain: "ethereum" },
          name: "eightdx_walletconnect_create_session",
          expected: { available: true, status: "pending", uri: "wc:test" }
        },
        {
          arguments: {},
          name: "eightdx_walletconnect_get_session",
          expected: { address: "0xWallet", connected: true }
        },
        {
          arguments: {
            blockchain: "ethereum",
            confirmedByUser: true,
            data: "0xabcdef",
            to: "0xAggregator",
            value: "0"
          },
          name: "eightdx_wallet_send_transaction",
          expected: { mode: "walletconnect", txHash: "0xWalletConnectTx" }
        },
        {
          arguments: {},
          name: "eightdx_local_signer_status",
          expected: { enabled: false, reason: "disabled by test" }
        },
        {
          arguments: {},
          name: "eightdx_walletconnect_disconnect",
          expected: { connected: false, status: "disconnected" }
        }
      ];

      for (const testCase of cases) {
        const result = await client.callTool({
          arguments: testCase.arguments,
          name: testCase.name
        });

        const parsed = parseToolJson(result as CallToolResult);

        if (typeof testCase.expected === "object" && testCase.expected !== null) {
          expect(parsed).toMatchObject(testCase.expected);
        } else {
          expect(parsed).toEqual(testCase.expected);
        }
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("exposes prompt scenarios that guide natural-language trading requests", async () => {
    const server = createEightDxMcpServer({ client: createClientStub() });
    const client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
        "eightdx_trading_agent",
        "eightdx_market_swap_scenario",
        "eightdx_limit_order_scenario"
      ]);

      const prompt = await client.getPrompt({
        name: "eightdx_market_swap_scenario",
        arguments: {
          userRequest: "обменяй мне 1 биткоин по рынку",
          surface: "telegram"
        }
      });

      const text = prompt.messages
        .map((message) => (message.content.type === "text" ? message.content.text : ""))
        .join("\n");

      const requiredFragments = [
        "eightdx_get_wallet_session",
        "eightdx_walletconnect_get_session",
        "eightdx_walletconnect_create_session",
        "Quote-first",
        "direct MCP WalletConnect",
        "enabled by default",
        "connectionOptions",
        "routeLink.url as the optional prefilled 8DX web page",
        "connected WalletConnect account as the wallet session",
        "fromAddress and dstAddress to the connected wallet",
        "eightdx_search_tokens",
        "Ask a follow-up question",
        "eightdx_preview_market_swap",
        "explicit confirmation",
        "eightdx_create_swap",
        "eightdx_wallet_send_transaction",
        "fallback",
        "do not sign"
      ];

      for (const requiredFragment of requiredFragments) {
        expect(text).toContain(requiredFragment);
      }

      const tradingPrompt = await client.getPrompt({
        name: "eightdx_trading_agent",
        arguments: {
          surface: "telegram"
        }
      });

      const tradingText = tradingPrompt.messages
        .map((message) => (message.content.type === "text" ? message.content.text : ""))
        .join("\n");

      expect(tradingText).toContain("Resolve or ask for the target chain");
      expect(tradingText).toContain("before creating a WalletConnect session");
      expect(tradingText).toContain("explicit user acceptance");
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function parseToolJson(result: CallToolResult): unknown {
  expect(result.content).toHaveLength(1);

  const [content] = result.content;
  expect(content).toMatchObject({ type: "text" });

  if (!content || content.type !== "text") {
    throw new Error("Expected text tool content.");
  }

  return JSON.parse(content.text);
}
