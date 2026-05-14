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
    getQuote: async () => ({ data: { totalAmountOut: "2" } })
  };
}

describe("8DX MCP server integration", () => {
  it("lists and calls tools over an MCP transport", async () => {
    const server = createEightDxMcpServer({ client: createClientStub() });
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
    const server = createEightDxMcpServer({ client: createClientStub() });
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
          arguments: {
            blockchain: "ethereum",
            deadline: 1_700_000_000,
            maker: "0xMaker",
            orderHash: "0xOrder",
            signature: "0xsignature"
          },
          name: "eightdx_cancel_limit_order",
          expected: { success: true }
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
