import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
});
