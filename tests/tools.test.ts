import { describe, expect, it } from "vitest";

import { createEightDxToolDefinitions } from "../src/tools.js";
import type { EightDxClient } from "../src/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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
      "eightdx_login_wallet",
      "eightdx_get_wallet_session",
      "eightdx_logout_wallet",
      "eightdx_get_quote",
      "eightdx_preview_market_swap",
      "eightdx_create_swap",
      "eightdx_get_permit_address",
      "eightdx_get_permit_data",
      "eightdx_create_limit_order",
      "eightdx_get_limit_orders_by_maker",
      "eightdx_get_limit_order_history",
      "eightdx_get_order_status",
      "eightdx_build_explorer_link",
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

  it("tracks a non-custodial wallet session through login, read, and logout tools", async () => {
    const tools = createEightDxToolDefinitions(createClientStub());
    const loginTool = tools.find((tool) => tool.name === "eightdx_login_wallet");
    const getSessionTool = tools.find((tool) => tool.name === "eightdx_get_wallet_session");
    const logoutTool = tools.find((tool) => tool.name === "eightdx_logout_wallet");

    const loginResult = parseToolJson(
      (await loginTool?.handler({
        blockchain: "ethereum",
        surface: "telegram",
        walletAddress: "0xWallet",
        walletApp: "MetaMask"
      })) as CallToolResult
    );

    expect(loginResult).toMatchObject({
      connected: true,
      session: {
        blockchain: "ethereum",
        surface: "telegram",
        walletAddress: "0xWallet",
        walletApp: "MetaMask"
      }
    });

    const sessionResult = parseToolJson((await getSessionTool?.handler({})) as CallToolResult);

    expect(sessionResult).toMatchObject({
      connected: true,
      session: { walletAddress: "0xWallet" }
    });

    const logoutResult = parseToolJson((await logoutTool?.handler({})) as CallToolResult);

    expect(logoutResult).toMatchObject({
      connected: false,
      previousSession: { walletAddress: "0xWallet" }
    });

    const clearedSessionResult = parseToolJson(
      (await getSessionTool?.handler({})) as CallToolResult
    );

    expect(clearedSessionResult).toMatchObject({
      connected: false,
      session: null
    });
  });

  it("previews market swaps with quote refresh metadata and an 8DX route link", async () => {
    const previewTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_preview_market_swap"
    );

    const result = parseToolJson(
      (await previewTool?.handler({
        blockchain: "bsc",
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountInWei: "1000000000000000000",
        deadline: 600,
        dstAddress: "0xWallet",
        slippageBps: 50
      })) as CallToolResult
    );

    expect(result).toMatchObject({
      quote: {
        data: {
          input: {
            blockchain: "bsc",
            amountInWei: "1000000000000000000"
          }
        }
      },
      refreshAfterSeconds: 30,
      selectedExecution: {
        deadline: 600,
        slippageBps: 50
      },
      wallet: {
        dstAddress: "0xWallet"
      }
    });

    const routeUrl = new URL((result as { routeLink: { url: string } }).routeLink.url);
    expect(routeUrl.origin).toBe("https://8dx.io");
    expect(routeUrl.searchParams.get("blockchain")).toBe("bsc");
    expect(routeUrl.searchParams.get("amountInWei")).toBe("1000000000000000000");
  });

  it("returns order status with scanner links for filled transaction hashes", async () => {
    const tools = createEightDxToolDefinitions({
      ...createClientStub(),
      getLimitOrderByHash: async () => ({
        filledTxHashes: ["0xFilledTx"],
        orderHash: "0xOrder",
        status: "filled"
      })
    });
    const statusTool = tools.find((tool) => tool.name === "eightdx_get_order_status");

    const result = parseToolJson(
      (await statusTool?.handler({
        blockchain: "arbitrum",
        orderHash: "0xOrder"
      })) as CallToolResult
    );

    expect(result).toMatchObject({
      status: "filled",
      explorerLinks: {
        filledTransactions: [
          {
            blockchain: "arbitrum",
            url: "https://arbiscan.io/tx/0xFilledTx",
            value: "0xFilledTx",
            valueType: "transaction"
          }
        ]
      }
    });
  });

  it("builds block explorer links and explains off-chain order hashes", async () => {
    const linkTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_build_explorer_link"
    );

    const txLink = parseToolJson(
      (await linkTool?.handler({
        blockchain: "ethereum",
        value: "0xTx",
        valueType: "transaction"
      })) as CallToolResult
    );
    const orderLink = parseToolJson(
      (await linkTool?.handler({
        blockchain: "ethereum",
        value: "0xOrder",
        valueType: "order"
      })) as CallToolResult
    );

    expect(txLink).toMatchObject({
      url: "https://etherscan.io/tx/0xTx",
      valueType: "transaction"
    });
    expect(orderLink).toMatchObject({
      url: null,
      valueType: "order"
    });
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

  it("accepts permit helper calls for all current 8DX API blockchains", async () => {
    const permitAddressTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_permit_address"
    );
    const permitDataTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_permit_data"
    );

    await expect(permitAddressTool?.handler({ blockchain: "arbitrum" })).resolves.toBeDefined();
    await expect(
      permitDataTool?.handler({
        blockchain: "arbitrum",
        addressTokenIn: "0xIn",
        dstAddress: "0xWallet",
        amountIn: "100"
      })
    ).resolves.toBeDefined();
  });

  it("accepts quote, swap, and limit-order calls for all current 8DX API blockchains", async () => {
    const tools = createEightDxToolDefinitions(createClientStub());
    const quoteTool = tools.find((tool) => tool.name === "eightdx_get_quote");
    const swapTool = tools.find((tool) => tool.name === "eightdx_create_swap");
    const ordersTool = tools.find((tool) => tool.name === "eightdx_get_limit_orders_by_maker");

    await expect(
      quoteTool?.handler({
        blockchain: "arbitrum",
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountIn: "100"
      })
    ).resolves.toBeDefined();
    await expect(
      swapTool?.handler({
        blockchain: "bsc",
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
    ).resolves.toBeDefined();
    await expect(
      ordersTool?.handler({ blockchain: "bsc", maker: "0xMaker" })
    ).resolves.toBeDefined();
  });

  it("rejects tools for blockchains outside the current 8DX API support", async () => {
    const tools = createEightDxToolDefinitions(createClientStub());
    const quoteTool = tools.find((tool) => tool.name === "eightdx_get_quote");

    await expect(
      quoteTool?.handler({
        blockchain: "polygon",
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountIn: "100"
      })
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["blockchain"],
          values: ["ethereum", "bsc", "arbitrum"]
        })
      ]
    });
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
