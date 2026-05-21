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
    getQuote: async (input) => ({ data: { totalAmountOut: "2", input } }),
    searchTokens: async (input) => ({
      data: [{ address: "0xBtc", blockchain: "ethereum", symbol: "WBTC" }],
      input
    })
  };
}

function createWalletExecutionStub() {
  return {
    walletConnect: {
      createSession: async () => ({
        accounts: [],
        available: true,
        deeplinks: {
          metamask: "https://metamask.app.link/wc?uri=wc%3Atest"
        },
        status: "pending",
        uri: "wc:test"
      }),
      disconnect: async () => ({ connected: false, status: "disconnected" }),
      getSession: async () => ({
        accounts: ["eip155:1:0xWallet"],
        address: "0xWallet",
        available: true,
        blockchain: "ethereum",
        connected: true,
        status: "connected"
      }),
      sendTransaction: async (input: Record<string, unknown>) => ({
        mode: "walletconnect",
        txHash: "0xWalletConnectTx",
        input
      })
    },
    localSigner: {
      getStatus: () => ({
        address: "0xSigner",
        blockchain: "ethereum",
        enabled: true
      }),
      signAndSendTransaction: async (input: Record<string, unknown>) => ({
        mode: "local-signer",
        txHash: "0xLocalSignerTx",
        input
      })
    }
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
      "eightdx_search_tokens",
      "eightdx_get_quote",
      "eightdx_preview_market_swap",
      "eightdx_get_wallet_links",
      "eightdx_create_swap",
      "eightdx_get_permit_address",
      "eightdx_get_permit_data",
      "eightdx_create_limit_order",
      "eightdx_get_limit_orders_by_maker",
      "eightdx_get_limit_order_history",
      "eightdx_get_order_status",
      "eightdx_build_explorer_link",
      "eightdx_cancel_limit_order",
      "eightdx_walletconnect_create_session",
      "eightdx_walletconnect_get_session",
      "eightdx_walletconnect_disconnect",
      "eightdx_wallet_send_transaction",
      "eightdx_local_signer_status",
      "eightdx_local_sign_and_send_transaction"
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

  it("searches tokens so agents can resolve user phrases like bitcoin", async () => {
    const tokenTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_search_tokens"
    );

    const result = parseToolJson(
      (await tokenTool?.handler({
        blockchain: "ethereum",
        q: "btc"
      })) as CallToolResult
    );

    expect(result).toMatchObject({
      data: [
        {
          address: "0xBtc",
          blockchain: "ethereum",
          symbol: "WBTC"
        }
      ],
      input: {
        blockchain: "ethereum",
        limit: 10,
        offset: 0,
        q: "btc"
      }
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
      },
      walletLinks: {
        webUrl:
          "https://8dx.io/swap?blockchain=bsc&addressTokenIn=0xIn&addressTokenOut=0xOut&amountInWei=1000000000000000000",
        metamaskMobileDappUrl:
          "https://metamask.app.link/dapp/8dx.io/swap?blockchain=bsc&addressTokenIn=0xIn&addressTokenOut=0xOut&amountInWei=1000000000000000000"
      },
      nextActions: expect.arrayContaining([
        expect.stringContaining("WalletConnect"),
        expect.stringContaining("connected wallet as both sender and destination"),
        expect.stringContaining("eightdx_wallet_send_transaction")
      ]),
      presentationHints: {
        telegram: expect.stringContaining("WalletConnect"),
        terminal: expect.stringContaining("fallback web handoff")
      }
    });

    expect((result as { presentationHints: { terminal: string } }).presentationHints.terminal).not
      .toContain("route link");

    const routeUrl = new URL((result as { routeLink: { url: string } }).routeLink.url);
    expect(routeUrl.origin).toBe("https://8dx.io");
    expect(routeUrl.searchParams.get("blockchain")).toBe("bsc");
    expect(routeUrl.searchParams.get("amountInWei")).toBe("1000000000000000000");
  });

  it("builds wallet handoff links for MetaMask and web fallback", async () => {
    const linksTool = createEightDxToolDefinitions(createClientStub()).find(
      (tool) => tool.name === "eightdx_get_wallet_links"
    );

    const result = parseToolJson(
      (await linksTool?.handler({
        routeUrl: "https://8dx.io/swap?blockchain=ethereum",
        walletApp: "MetaMask"
      })) as CallToolResult
    );

    expect(result).toMatchObject({
      walletApp: "MetaMask",
      webUrl: "https://8dx.io/swap?blockchain=ethereum",
      metamaskMobileDappUrl: "https://metamask.app.link/dapp/8dx.io/swap?blockchain=ethereum",
      instructions: expect.arrayContaining([
        expect.stringContaining("fallback"),
        expect.stringContaining("WalletConnect"),
        expect.stringContaining("webUrl"),
        expect.stringContaining("MetaMask Mobile")
      ]),
      walletConnectNote: expect.stringContaining("EIGHTDX_WALLETCONNECT_PROJECT_ID")
    });
  });

  it("creates WalletConnect sessions and sends wallet transaction requests", async () => {
    const tools = createEightDxToolDefinitions(createClientStub(), {
      walletExecution: createWalletExecutionStub()
    });
    const createSessionTool = tools.find(
      (tool) => tool.name === "eightdx_walletconnect_create_session"
    );
    const getSessionTool = tools.find((tool) => tool.name === "eightdx_walletconnect_get_session");
    const sendTool = tools.find((tool) => tool.name === "eightdx_wallet_send_transaction");
    const disconnectTool = tools.find((tool) => tool.name === "eightdx_walletconnect_disconnect");

    expect(
      parseToolJson(
        (await createSessionTool?.handler({ blockchain: "ethereum" })) as CallToolResult
      )
    ).toMatchObject({
      available: true,
      status: "pending",
      uri: "wc:test"
    });
    expect(parseToolJson((await getSessionTool?.handler({})) as CallToolResult)).toMatchObject({
      address: "0xWallet",
      connected: true
    });
    expect(
      parseToolJson(
        (await sendTool?.handler({
          blockchain: "ethereum",
          confirmedByUser: true,
          data: "0xabcdef",
          fromAddress: "0xWallet",
          to: "0xAggregator",
          value: "0"
        })) as CallToolResult
      )
    ).toMatchObject({
      mode: "walletconnect",
      txHash: "0xWalletConnectTx"
    });
    expect(parseToolJson((await disconnectTool?.handler({})) as CallToolResult)).toMatchObject({
      connected: false,
      status: "disconnected"
    });
  });

  it("keeps direct execution disabled unless WalletConnect or local signer is configured", async () => {
    const tools = createEightDxToolDefinitions(createClientStub());
    const walletSessionTool = tools.find(
      (tool) => tool.name === "eightdx_walletconnect_get_session"
    );
    const localStatusTool = tools.find((tool) => tool.name === "eightdx_local_signer_status");
    const walletSendTool = tools.find((tool) => tool.name === "eightdx_wallet_send_transaction");

    expect(parseToolJson((await walletSessionTool?.handler({})) as CallToolResult)).toMatchObject({
      available: false,
      connected: false,
      status: "unavailable"
    });
    expect(parseToolJson((await localStatusTool?.handler({})) as CallToolResult)).toMatchObject({
      enabled: false
    });
    await expect(
      walletSendTool?.handler({
        blockchain: "ethereum",
        confirmedByUser: true,
        data: "0xabcdef",
        to: "0xAggregator",
        value: "0"
      })
    ).rejects.toThrow("WalletConnect is disabled.");
  });

  it("requires explicit confirmation before wallet or local signer sends", async () => {
    const tools = createEightDxToolDefinitions(createClientStub(), {
      walletExecution: createWalletExecutionStub()
    });
    const walletSendTool = tools.find((tool) => tool.name === "eightdx_wallet_send_transaction");
    const localSendTool = tools.find(
      (tool) => tool.name === "eightdx_local_sign_and_send_transaction"
    );

    await expect(
      walletSendTool?.handler({
        blockchain: "ethereum",
        confirmedByUser: false,
        data: "0xabcdef",
        to: "0xAggregator",
        value: "0"
      })
    ).rejects.toThrow("confirmedByUser must be true");
    await expect(
      localSendTool?.handler({
        blockchain: "ethereum",
        confirmedByUser: false,
        data: "0xabcdef",
        to: "0xAggregator",
        value: "0"
      })
    ).rejects.toThrow("confirmedByUser must be true");
  });

  it("reports local signer status and can send through an explicitly enabled signer", async () => {
    const tools = createEightDxToolDefinitions(createClientStub(), {
      walletExecution: createWalletExecutionStub()
    });
    const statusTool = tools.find((tool) => tool.name === "eightdx_local_signer_status");
    const sendTool = tools.find((tool) => tool.name === "eightdx_local_sign_and_send_transaction");

    expect(parseToolJson((await statusTool?.handler({})) as CallToolResult)).toMatchObject({
      address: "0xSigner",
      enabled: true
    });
    expect(
      parseToolJson(
        (await sendTool?.handler({
          blockchain: "ethereum",
          confirmedByUser: true,
          data: "0xabcdef",
          to: "0xAggregator",
          value: "0"
        })) as CallToolResult
      )
    ).toMatchObject({
      mode: "local-signer",
      txHash: "0xLocalSignerTx"
    });
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
