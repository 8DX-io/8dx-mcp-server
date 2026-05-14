import { describe, expect, it } from "vitest";

import { createEightDxToolDefinitions } from "../src/tools.js";
import type { EightDxClient } from "../src/types.js";

function createClientStub(): EightDxClient {
  return {
    cancelLimitOrder: async (input) => ({ success: true, input }),
    createLimitOrder: async (input) => ({ success: true, input }),
    createSwap: async (input) => ({ data: "0xcalldata", minReturnAmountOut: "1", input }),
    getHealth: async () => "ok",
    getLimitOrderByHash: async (input) => ({ hash: input.orderHash }),
    getLimitOrderHistory: async (input) => ({ data: [], input }),
    getLimitOrdersByMaker: async (input) => ({ data: [], input }),
    getPermitAddress: async (input) => ({ data: `permit-${input.blockchain}` }),
    getPermitData: async (input) => ({ alreadyApproved: false, alreadyPermit: false, input }),
    getQuote: async (input) => ({ data: { totalAmountOut: "2", input } })
  };
}

describe("createEightDxToolDefinitions", () => {
  it("exposes one MCP tool for each supported 8DX REST route", () => {
    const tools = createEightDxToolDefinitions(createClientStub());

    expect(tools.map((tool) => tool.name)).toEqual([
      "eightdx_health",
      "eightdx_get_quote",
      "eightdx_create_swap",
      "eightdx_get_permit_address",
      "eightdx_get_permit_data",
      "eightdx_create_limit_order",
      "eightdx_get_limit_orders_by_maker",
      "eightdx_get_limit_order_history",
      "eightdx_cancel_limit_order"
    ]);
  });

  it("returns quote data as JSON tool content", async () => {
    const quoteTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_quote"
    );

    const result = await quoteTool?.handler({
      blockchain: "ethereum",
      addressTokenIn: "0xIn",
      addressTokenOut: "0xOut",
      amountIn: "100"
    });

    expect(result?.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(
          {
            data: {
              totalAmountOut: "2",
              input: {
                blockchain: "ethereum",
                addressTokenIn: "0xIn",
                addressTokenOut: "0xOut",
                amountIn: "100"
              }
            }
          },
          null,
          2
        )
      }
    ]);
  });

  it("marks write tools with explicit signing safety language", () => {
    const tools = createEightDxToolDefinitions(createClientStub());

    expect(tools.find((tool) => tool.name === "eightdx_create_swap")?.description).toContain(
      "does not sign"
    );
    expect(tools.find((tool) => tool.name === "eightdx_create_limit_order")?.description).toContain(
      "already signed"
    );
  });

  it("rejects permit helper calls for blockchains without live permit support", async () => {
    const permitAddressTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_permit_address"
    );
    const permitDataTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_permit_data"
    );

    await expect(permitAddressTool?.handler({ blockchain: "arbitrum" })).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum", "bsc"]
        })
      ]
    });
    await expect(
      permitDataTool?.handler({
        blockchain: "arbitrum",
        addressTokenIn: "0xIn",
        dstAddress: "0xWallet",
        amountIn: "100"
      })
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum", "bsc"]
        })
      ]
    });
  });

  it("rejects quote, swap, and limit-order calls for blockchains without live route support", async () => {
    const tools = createEightDxToolDefinitions(createClientStub());
    const quoteTool = tools.find((tool) => tool.name === "eightdx_get_quote");
    const swapTool = tools.find((tool) => tool.name === "eightdx_create_swap");
    const ordersTool = tools.find((tool) => tool.name === "eightdx_get_limit_orders_by_maker");

    await expect(
      quoteTool?.handler({
        blockchain: "bsc",
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountIn: "100"
      })
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum"]
        })
      ]
    });
    await expect(
      swapTool?.handler({
        blockchain: "arbitrum",
        dstAddress: "0xWallet",
        path: {
          addressTokenIn: "0xIn",
          addressTokenOut: "0xOut",
          amountIn: "100",
          steps: [],
          totalAmountOut: "200",
          totalPriceImpact: 0
        }
      })
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum"]
        })
      ]
    });
    await expect(
      ordersTool?.handler({ blockchain: "bsc", maker: "0xMaker" })
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum"]
        })
      ]
    });
  });
});
