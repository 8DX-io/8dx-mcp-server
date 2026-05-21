import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import type { Blockchain, EightDxClient, JsonObject } from "./types.js";
import { createDisabledWalletExecution, type WalletExecution } from "./wallet-execution.js";

type ToolDefinition = {
  description: string;
  handler(input: Record<string, unknown>): Promise<CallToolResult>;
  inputSchema: ZodRawShape;
  name: string;
  title: string;
};

const supportedBlockchains = ["ethereum", "bsc", "arbitrum"] as const;

const blockchainSchema = z
  .enum(supportedBlockchains)
  .describe("Blockchain network with live 8DX API support.");

const permitBlockchainSchema = z
  .enum(supportedBlockchains)
  .describe("Blockchain network with live 8DX permit helper support.");

const walletSurfaceSchema = z
  .enum(["terminal", "telegram", "other"])
  .describe("Client surface that will display wallet prompts.");

const explorerValueTypeSchema = z
  .enum(["transaction", "address", "token", "order"])
  .describe("Type of blockchain or 8DX identifier to link.");

type WalletSession = {
  blockchain: Blockchain;
  connectedAt: string;
  surface?: "terminal" | "telegram" | "other" | null | undefined;
  walletAddress: string;
  walletApp?: string | null | undefined;
};

type ToolOptions = {
  walletExecution?: WalletExecution | undefined;
};

const addressSchema = (description: string) =>
  z
    .string()
    .min(1)
    .describe(`${description} Use the token identifier format accepted by the 8DX API.`);

const amountSchema = (description: string) =>
  z
    .string()
    .min(1)
    .describe(
      `${description} Pass the exact amount format expected by the 8DX REST API for this token.`
    );

const inputPathSchema = z
  .object({
    addressTokenIn: addressSchema("Input token address or native-token identifier."),
    addressTokenOut: addressSchema("Output token address or native-token identifier."),
    amountIn: amountSchema("Input token amount for the route."),
    steps: z.array(z.array(z.record(z.string(), z.unknown()))).describe("Route steps from quote."),
    totalAmountOut: z.string().describe("Total output amount from quote."),
    totalPriceImpact: z.number().describe("Total route price impact from quote.")
  })
  .passthrough()
  .describe("Route path returned by eightdx_get_quote.");

const makerTraitsSchema = z
  .object({
    allowMultipleFills: z.boolean(),
    allowPartialFills: z.boolean(),
    allowedSenderSuffix: z.string(),
    expiration: z.number(),
    hasExtension: z.boolean(),
    needCheckEpochManager: z.boolean(),
    needPostInteractionCall: z.boolean(),
    needPreInteractionCall: z.boolean(),
    nonceOrEpoch: z.number(),
    series: z.number(),
    unwrapWeth: z.boolean(),
    usePermit2: z.boolean()
  })
  .passthrough()
  .describe("Maker traits produced by the 8DX limit-order signing flow.");

const limitOrderParamsSchema = z
  .object({
    extension: z.string().nullable().optional().describe("Optional limit-order extension data."),
    makerTraits: makerTraitsSchema,
    makingAmount: amountSchema("Amount the maker gives."),
    salt: z.string().min(1).describe("Order salt from the signing flow."),
    signature: z.string().min(1).describe("Maker signature for the order."),
    takingAmount: amountSchema("Amount the maker expects to receive.")
  })
  .passthrough();

const permitSwapBodySchema = z
  .object({
    data: z.record(z.string(), z.unknown()).describe("Permit data signed by the user."),
    signature: z.string().min(1).describe("User signature for the permit data.")
  })
  .passthrough();

export function createEightDxToolDefinitions(
  client: EightDxClient,
  options: ToolOptions = {}
): ToolDefinition[] {
  let walletSession: WalletSession | null = null;
  const walletExecution = options.walletExecution ?? createDisabledWalletExecution();

  return [
    {
      description: "Checks whether the configured 8DX REST API is reachable.",
      handler: async () => toJsonToolResult(await client.getHealth()),
      inputSchema: {},
      name: "eightdx_health",
      title: "8DX API Health"
    },
    {
      description:
        "Stores a non-custodial local wallet session for AI-guided 8DX flows. This records only public wallet metadata and never stores private keys.",
      handler: async (input) => {
        const parsed = parseWalletLoginInput(input);
        walletSession = {
          ...parsed,
          connectedAt: new Date().toISOString()
        };

        return toJsonToolResult({
          connected: true,
          session: walletSession,
          safety: signingSafetyNotice(),
          nextActions: [
            "Use eightdx_preview_market_swap to refresh a market quote before creating calldata.",
            "Use externally signed payloads for limit orders and cancel requests."
          ]
        });
      },
      inputSchema: {
        blockchain: blockchainSchema,
        surface: walletSurfaceSchema.nullable().optional(),
        walletAddress: addressSchema("Public wallet address to associate with this MCP session."),
        walletApp: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional wallet app name, such as MetaMask, Rabby, Trust Wallet, or Safe.")
      },
      name: "eightdx_login_wallet",
      title: "Log In 8DX Wallet Session"
    },
    {
      description: "Returns the current local non-custodial wallet session, if one is set.",
      handler: async () =>
        toJsonToolResult({
          connected: walletSession !== null,
          session: walletSession,
          safety: signingSafetyNotice()
        }),
      inputSchema: {},
      name: "eightdx_get_wallet_session",
      title: "Get 8DX Wallet Session"
    },
    {
      description:
        "Clears the current local wallet session. This does not revoke wallet approvals or cancel on-chain permissions.",
      handler: async () => {
        const previousSession = walletSession;
        walletSession = null;

        return toJsonToolResult({
          connected: false,
          previousSession,
          safety:
            "Local MCP wallet session cleared. Revoke approvals in the wallet or block explorer if needed."
        });
      },
      inputSchema: {},
      name: "eightdx_logout_wallet",
      title: "Log Out 8DX Wallet Session"
    },
    {
      description:
        "Searches 8DX token metadata so an AI agent can resolve user phrases like BTC, bitcoin, USDC, or a token name before quoting.",
      handler: async (input) =>
        toJsonToolResult(await client.searchTokens(parseTokenSearchInput(input))),
      inputSchema: {
        blockchain: blockchainSchema.optional(),
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .default(10)
          .describe("Maximum number of token results to return."),
        offset: z
          .number()
          .int()
          .nonnegative()
          .default(0)
          .describe("Number of token results to skip."),
        q: z.string().min(1).optional().describe("Token symbol, name, or address search query."),
        sort: z.enum(["asc", "desc"]).optional().describe("Optional sort order.")
      },
      name: "eightdx_search_tokens",
      title: "Search 8DX Tokens"
    },
    {
      description:
        "Gets an 8DX swap quote for a token pair and amount. This is a read-only operation.",
      handler: async (input) => toJsonToolResult(await client.getQuote(parseQuoteInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        addressTokenIn: addressSchema("Token address or native-token identifier to sell."),
        addressTokenOut: addressSchema("Token address or native-token identifier to buy."),
        amountIn: amountSchema("Normalized input token amount to quote.").optional(),
        amountInWei: amountSchema("Smallest-unit input token amount to quote.").optional()
      },
      name: "eightdx_get_quote",
      title: "Get 8DX Quote"
    },
    {
      description:
        "Previews a market swap for an AI-guided flow. Returns quote data, a 30-second refresh hint, selected slippage/deadline metadata, 8DX route link metadata, and external signing guidance.",
      handler: async (input) => {
        const parsed = parseMarketSwapPreviewInput(input);
        const quote = await client.getQuote(parsed);

        const routeLink = buildEightDxRouteLink(parsed);

        return toJsonToolResult({
          quote,
          refreshAfterSeconds: 30,
          selectedExecution: {
            deadline: parsed.deadline ?? null,
            slippageBps: parsed.slippageBps ?? null
          },
          wallet: {
            dstAddress: parsed.dstAddress ?? walletSession?.walletAddress ?? null,
            session: walletSession
          },
          routeLink,
          walletLinks: buildWalletLinks({
            routeUrl: routeLink.url,
            walletApp: walletSession?.walletApp ?? null
          }),
          safety: signingSafetyNotice(),
          nextActions: [
            "Refresh this preview if it is older than 30 seconds before asking the user to confirm.",
            "For WalletConnect-first execution, use the connected wallet as both sender and destination for a normal self-swap unless the user explicitly requested another recipient.",
            "After the user explicitly confirms the quoted swap parameters, call eightdx_create_swap with the quoted path, slippage, deadline, fromAddress, and destination wallet.",
            "Display the returned transaction payload, then call eightdx_wallet_send_transaction with confirmedByUser true so the connected wallet can request final approval."
          ],
          presentationHints: {
            telegram:
              "Show the quote summary, WalletConnect status, connected-wallet recipient, slippage, deadline, and a wallet confirmation action.",
            terminal:
              "Print the quote summary, WalletConnect status, connected-wallet sender/recipient, and exact transaction fields before asking for confirmation. Show route/web wallet links only as fallback web handoff links."
          }
        });
      },
      inputSchema: {
        blockchain: blockchainSchema,
        addressTokenIn: addressSchema("Token address or native-token identifier to sell."),
        addressTokenOut: addressSchema("Token address or native-token identifier to buy."),
        amountIn: amountSchema("Normalized input token amount to quote.").optional(),
        amountInWei: amountSchema("Smallest-unit input token amount to quote.").optional(),
        deadline: z.number().int().nonnegative().nullable().optional(),
        dstAddress: addressSchema("Optional destination wallet address.").nullable().optional(),
        slippageBps: z.number().int().nonnegative().nullable().optional()
      },
      name: "eightdx_preview_market_swap",
      title: "Preview 8DX Market Swap"
    },
    {
      description:
        "Builds wallet handoff links for an 8DX route, including a MetaMask Mobile dapp deeplink and web fallback. This does not connect or sign by itself.",
      handler: async (input) => toJsonToolResult(buildWalletLinks(parseWalletLinksInput(input))),
      inputSchema: {
        routeUrl: z
          .string()
          .url()
          .default("https://8dx.io/swap")
          .describe("8DX route or swap page URL to open in a wallet browser."),
        walletApp: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional preferred wallet app name.")
      },
      name: "eightdx_get_wallet_links",
      title: "Get 8DX Wallet Links"
    },
    {
      description:
        "Creates swap calldata from a quoted path. This tool does not sign transactions, does not send transactions, and does not custody funds.",
      handler: async (input) => toJsonToolResult(await client.createSwap(parseSwapInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        deadline: z.number().nullable().optional().describe("Optional swap deadline."),
        dstAddress: addressSchema("Destination wallet address for the swap result."),
        fromAddress: addressSchema("Optional sender wallet address.").nullable().optional(),
        path: inputPathSchema,
        permit: permitSwapBodySchema.nullable().optional(),
        skipSimulation: z.boolean().nullable().optional(),
        slippageBps: z.number().int().nonnegative().nullable().optional(),
        usePermit: z.boolean().nullable().optional()
      },
      name: "eightdx_create_swap",
      title: "Create 8DX Swap Calldata"
    },
    {
      description: "Gets the permit contract address for a supported 8DX blockchain.",
      handler: async (input) =>
        toJsonToolResult(await client.getPermitAddress(parsePermitBlockchainInput(input))),
      inputSchema: {
        blockchain: permitBlockchainSchema
      },
      name: "eightdx_get_permit_address",
      title: "Get 8DX Permit Address"
    },
    {
      description:
        "Gets permit typed data for a token approval flow. This tool only returns data to sign; it does not sign anything.",
      handler: async (input) =>
        toJsonToolResult(await client.getPermitData(parsePermitDataInput(input))),
      inputSchema: {
        blockchain: permitBlockchainSchema,
        addressTokenIn: addressSchema("Token address or native-token identifier to approve."),
        dstAddress: addressSchema("Destination spender or wallet address used by the permit flow."),
        amountIn: amountSchema("Amount to include in permit data.")
      },
      name: "eightdx_get_permit_data",
      title: "Get 8DX Permit Data"
    },
    {
      description:
        "Submits an already signed 8DX limit order payload. This tool does not create signatures and expects an already signed order.",
      handler: async (input) =>
        toJsonToolResult(await client.createLimitOrder(parseLimitOrderInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        maker: addressSchema("Maker wallet address."),
        makerSrcOrToken: addressSchema("Token or source asset the maker gives."),
        orderType: z.enum(["limit", "twap"]).describe("Limit order type supported by 8DX."),
        params: limitOrderParamsSchema,
        recipient: addressSchema("Optional recipient wallet address.").nullable().optional(),
        takerSrcOrToken: addressSchema("Token or source asset the taker gives.")
      },
      name: "eightdx_create_limit_order",
      title: "Create 8DX Limit Order"
    },
    {
      description: "Gets active 8DX limit orders for a maker address.",
      handler: async (input) =>
        toJsonToolResult(await client.getLimitOrdersByMaker(parseOrdersByMakerInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        maker: addressSchema("Maker wallet address.")
      },
      name: "eightdx_get_limit_orders_by_maker",
      title: "Get 8DX Limit Orders By Maker"
    },
    {
      description: "Gets paginated 8DX limit-order history for a maker address.",
      handler: async (input) =>
        toJsonToolResult(await client.getLimitOrderHistory(parseOrderHistoryInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        cursor: z.string().optional().describe("Optional pagination cursor."),
        limit: z.number().int().positive().describe("Maximum number of orders to return."),
        maker: addressSchema("Maker wallet address."),
        offset: z.number().int().nonnegative().optional().describe("Optional pagination offset."),
        sort: z.enum(["asc", "desc"]).optional().describe("Optional sort order.")
      },
      name: "eightdx_get_limit_order_history",
      title: "Get 8DX Limit Order History"
    },
    {
      description:
        "Gets an 8DX limit order by hash and returns block explorer links for filled transaction hashes when present.",
      handler: async (input) => {
        const parsed = parseOrderStatusInput(input);
        const order = await client.getLimitOrderByHash(parsed);
        const filledTxHashes = extractFilledTxHashes(order);

        return toJsonToolResult({
          order,
          status: extractOrderStatus(order),
          explorerLinks: {
            filledTransactions: filledTxHashes.map((hash) =>
              buildExplorerLinkResult({
                blockchain: parsed.blockchain,
                value: hash,
                valueType: "transaction"
              })
            )
          },
          nextActions:
            filledTxHashes.length > 0
              ? ["Open the scanner links to inspect filled transactions."]
              : ["If the order is still active, poll this tool later or query order history."]
        });
      },
      inputSchema: {
        blockchain: blockchainSchema,
        orderHash: z.string().min(1).describe("8DX order hash to inspect.")
      },
      name: "eightdx_get_order_status",
      title: "Get 8DX Order Status"
    },
    {
      description:
        "Builds a chain-specific block explorer link for a transaction, address, token, or explains that an 8DX order hash is not a chain transaction.",
      handler: async (input) =>
        toJsonToolResult(buildExplorerLinkResult(parseExplorerLinkInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        value: z.string().min(1).describe("Hash or address to link."),
        valueType: explorerValueTypeSchema
      },
      name: "eightdx_build_explorer_link",
      title: "Build 8DX Explorer Link"
    },
    {
      description:
        "Cancels an 8DX limit order using an already signed cancel payload. This tool does not create signatures.",
      handler: async (input) =>
        toJsonToolResult(await client.cancelLimitOrder(parseCancelOrderInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        deadline: z.number().int().positive().describe("Cancel request deadline."),
        maker: addressSchema("Maker wallet address."),
        orderHash: z.string().min(1).describe("8DX order hash to cancel."),
        signature: z.string().min(1).describe("Maker signature for the cancel request.")
      },
      name: "eightdx_cancel_limit_order",
      title: "Cancel 8DX Limit Order"
    },
    {
      description:
        "Creates a WalletConnect session URI/deeplink so the user can connect a wallet. The wallet, not MCP, signs transaction requests.",
      handler: async (input) =>
        toJsonToolResult(
          await walletExecution.walletConnect.createSession(parseWalletConnectCreateInput(input))
        ),
      inputSchema: {
        blockchain: blockchainSchema
      },
      name: "eightdx_walletconnect_create_session",
      title: "Create 8DX WalletConnect Session"
    },
    {
      description: "Reads the current WalletConnect session and connected wallet account, if any.",
      handler: async (input) =>
        toJsonToolResult(
          await walletExecution.walletConnect.getSession(parseWalletConnectSessionInput(input))
        ),
      inputSchema: {
        waitMs: z
          .number()
          .int()
          .nonnegative()
          .max(60_000)
          .optional()
          .describe("Optional wait time for a pending WalletConnect approval.")
      },
      name: "eightdx_walletconnect_get_session",
      title: "Get 8DX WalletConnect Session"
    },
    {
      description: "Disconnects the current WalletConnect session, if one exists.",
      handler: async () => toJsonToolResult(await walletExecution.walletConnect.disconnect()),
      inputSchema: {},
      name: "eightdx_walletconnect_disconnect",
      title: "Disconnect 8DX WalletConnect Session"
    },
    {
      description:
        "Requests the connected wallet to sign and broadcast a prepared transaction via WalletConnect eth_sendTransaction. Requires explicit user confirmation.",
      handler: async (input) =>
        toJsonToolResult(
          await walletExecution.walletConnect.sendTransaction(parseTransactionInput(input))
        ),
      inputSchema: transactionInputSchema(),
      name: "eightdx_wallet_send_transaction",
      title: "Send 8DX Wallet Transaction"
    },
    {
      description:
        "Shows whether the opt-in local signer is enabled. Local signing is disabled by default and requires explicit environment configuration.",
      handler: async () => toJsonToolResult(walletExecution.localSigner.getStatus()),
      inputSchema: {},
      name: "eightdx_local_signer_status",
      title: "Get 8DX Local Signer Status"
    },
    {
      description:
        "Signs and broadcasts a prepared transaction with the opt-in local signer. Requires EIGHTDX_ENABLE_LOCAL_SIGNER=true and explicit user confirmation.",
      handler: async (input) =>
        toJsonToolResult(
          await walletExecution.localSigner.signAndSendTransaction(parseTransactionInput(input))
        ),
      inputSchema: transactionInputSchema(),
      name: "eightdx_local_sign_and_send_transaction",
      title: "Local Sign And Send 8DX Transaction"
    }
  ];
}

export function registerEightDxTools(
  server: McpServer,
  client: EightDxClient,
  options: ToolOptions = {}
): void {
  for (const tool of createEightDxToolDefinitions(client, options)) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        title: tool.title
      },
      async (args) => tool.handler(args as Record<string, unknown>)
    );
  }
}

function toJsonToolResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        text: JSON.stringify(data, null, 2),
        type: "text"
      }
    ]
  };
}

function parseQuoteInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      addressTokenIn: z.string().min(1),
      addressTokenOut: z.string().min(1),
      amountIn: z.string().min(1).optional(),
      amountInWei: z.string().min(1).optional()
    })
    .refine((value) => value.amountIn !== undefined || value.amountInWei !== undefined, {
      message: "Either amountIn or amountInWei must be provided.",
      path: ["amountIn"]
    })
    .parse(input);
}

function parseWalletLoginInput(input: Record<string, unknown>): Omit<WalletSession, "connectedAt"> {
  return z
    .object({
      blockchain: blockchainSchema,
      surface: walletSurfaceSchema.nullable().optional(),
      walletAddress: z.string().min(1),
      walletApp: z.string().min(1).nullable().optional()
    })
    .parse(input);
}

function parseTokenSearchInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema.optional(),
      limit: z.number().int().positive().max(50).default(10),
      offset: z.number().int().nonnegative().default(0),
      q: z.string().min(1).optional(),
      sort: z.enum(["asc", "desc"]).optional()
    })
    .parse(input);
}

function parseMarketSwapPreviewInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      addressTokenIn: z.string().min(1),
      addressTokenOut: z.string().min(1),
      amountIn: z.string().min(1).optional(),
      amountInWei: z.string().min(1).optional(),
      deadline: z.number().int().nonnegative().nullable().optional(),
      dstAddress: z.string().min(1).nullable().optional(),
      slippageBps: z.number().int().nonnegative().nullable().optional()
    })
    .refine((value) => value.amountIn !== undefined || value.amountInWei !== undefined, {
      message: "Either amountIn or amountInWei must be provided.",
      path: ["amountIn"]
    })
    .parse(input);
}

function parseWalletLinksInput(input: Record<string, unknown>) {
  return z
    .object({
      routeUrl: z.string().url().default("https://8dx.io/swap"),
      walletApp: z.string().min(1).nullable().optional()
    })
    .parse(input);
}

function parseSwapInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      deadline: z.number().nullable().optional(),
      dstAddress: z.string().min(1),
      fromAddress: z.string().min(1).nullable().optional(),
      path: inputPathSchema,
      permit: permitSwapBodySchema.nullable().optional(),
      skipSimulation: z.boolean().nullable().optional(),
      slippageBps: z.number().int().nonnegative().nullable().optional(),
      usePermit: z.boolean().nullable().optional()
    })
    .parse(input);
}

function parsePermitBlockchainInput(input: Record<string, unknown>) {
  return z.object({ blockchain: permitBlockchainSchema }).parse(input);
}

function parsePermitDataInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: permitBlockchainSchema,
      addressTokenIn: z.string().min(1),
      dstAddress: z.string().min(1),
      amountIn: z.string().min(1)
    })
    .parse(input);
}

function parseLimitOrderInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      maker: z.string().min(1),
      makerSrcOrToken: z.string().min(1),
      orderType: z.enum(["limit", "twap"]),
      params: limitOrderParamsSchema,
      recipient: z.string().min(1).nullable().optional(),
      takerSrcOrToken: z.string().min(1)
    })
    .parse(input);
}

function parseOrdersByMakerInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      maker: z.string().min(1)
    })
    .parse(input);
}

function parseOrderHistoryInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      cursor: z.string().optional(),
      limit: z.number().int().positive(),
      maker: z.string().min(1),
      offset: z.number().int().nonnegative().optional(),
      sort: z.enum(["asc", "desc"]).optional()
    })
    .parse(input);
}

function parseCancelOrderInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      deadline: z.number().int().positive(),
      maker: z.string().min(1),
      orderHash: z.string().min(1),
      signature: z.string().min(1)
    })
    .parse(input);
}

function parseWalletConnectCreateInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema
    })
    .parse(input);
}

function parseWalletConnectSessionInput(input: Record<string, unknown>) {
  return z
    .object({
      waitMs: z.number().int().nonnegative().max(60_000).optional()
    })
    .parse(input);
}

function parseTransactionInput(input: Record<string, unknown>) {
  const parsed = z
    .object({
      blockchain: blockchainSchema,
      confirmedByUser: z.boolean(),
      data: z.string().min(1),
      fromAddress: z.string().min(1).nullable().optional(),
      requestLabel: z.string().min(1).nullable().optional(),
      to: z.string().min(1),
      value: z.string().min(1)
    })
    .parse(input);

  if (parsed.confirmedByUser !== true) {
    throw new Error("confirmedByUser must be true before sending a transaction.");
  }

  return parsed;
}

function transactionInputSchema(): ZodRawShape {
  return {
    blockchain: blockchainSchema,
    confirmedByUser: z
      .boolean()
      .describe("Must be true only after the user explicitly confirmed the prepared transaction."),
    data: z.string().min(1).describe("Transaction calldata."),
    fromAddress: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("Optional sender wallet address."),
    requestLabel: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("Optional user-facing request label."),
    to: z.string().min(1).describe("Transaction recipient contract address."),
    value: z.string().min(1).describe("Native token value in wei as a decimal string.")
  };
}

function parseOrderStatusInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      orderHash: z.string().min(1)
    })
    .parse(input);
}

function parseExplorerLinkInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      value: z.string().min(1),
      valueType: explorerValueTypeSchema
    })
    .parse(input);
}

function signingSafetyNotice(): string {
  return "8DX MCP never stores private keys. Transaction execution requires explicit user confirmation: WalletConnect asks the user's wallet to sign and broadcast, while the local signer works only when deliberately enabled with environment variables.";
}

function buildEightDxRouteLink(input: {
  addressTokenIn: string;
  addressTokenOut: string;
  amountIn?: string | undefined;
  amountInWei?: string | undefined;
  blockchain: Blockchain;
}): { note: string; url: string } {
  const url = new URL("/swap", "https://8dx.io");
  url.searchParams.set("blockchain", input.blockchain);
  url.searchParams.set("addressTokenIn", input.addressTokenIn);
  url.searchParams.set("addressTokenOut", input.addressTokenOut);

  if (input.amountIn !== undefined) {
    url.searchParams.set("amountIn", input.amountIn);
  }

  if (input.amountInWei !== undefined) {
    url.searchParams.set("amountInWei", input.amountInWei);
  }

  return {
    note: "Candidate 8DX web route link for clients that support pair prefill parameters.",
    url: url.toString()
  };
}

function buildWalletLinks(input: { routeUrl: string; walletApp?: string | null | undefined }): {
  instructions: string[];
  metamaskInstallUrl: string;
  metamaskMobileDappUrl: string;
  walletApp: string | null;
  walletConnectNote: string;
  webUrl: string;
} {
  const routeUrl = new URL(input.routeUrl);
  const dappTarget = `${routeUrl.host}${routeUrl.pathname}${routeUrl.search}${routeUrl.hash}`;

  return {
    instructions: [
      "These are fallback web handoff links for when WalletConnect direct confirmation is unavailable or the user explicitly chooses the 8DX UI.",
      "Open the webUrl in a browser with your wallet extension, or open the MetaMask Mobile dapp URL on mobile.",
      "The wallet or 8DX page must show the final transaction details; the user must review and confirm manually."
    ],
    metamaskInstallUrl: "https://metamask.io/download/",
    metamaskMobileDappUrl: `https://metamask.app.link/dapp/${dappTarget}`,
    walletApp: input.walletApp ?? null,
    walletConnectNote:
      "Direct MCP wallet confirmation requires WalletConnect. Configure EIGHTDX_WALLETCONNECT_PROJECT_ID and use eightdx_walletconnect_create_session when the host can display a WalletConnect URI.",
    webUrl: routeUrl.toString()
  };
}

function buildExplorerLinkResult(input: {
  blockchain: Blockchain;
  value: string;
  valueType: "transaction" | "address" | "token" | "order";
}): {
  blockchain: Blockchain;
  note?: string;
  url: string | null;
  value: string;
  valueType: string;
} {
  if (input.valueType === "order") {
    return {
      blockchain: input.blockchain,
      note: "8DX order hashes are off-chain order identifiers, not blockchain transactions. Use eightdx_get_order_status for details.",
      url: null,
      value: input.value,
      valueType: input.valueType
    };
  }

  const pathByType = {
    address: "address",
    token: "token",
    transaction: "tx"
  } as const;

  return {
    blockchain: input.blockchain,
    url: `${explorerBaseUrl(input.blockchain)}/${pathByType[input.valueType]}/${encodeURIComponent(
      input.value
    )}`,
    value: input.value,
    valueType: input.valueType
  };
}

function explorerBaseUrl(blockchain: Blockchain): string {
  const baseUrls: Record<Blockchain, string> = {
    arbitrum: "https://arbiscan.io",
    bsc: "https://bscscan.com",
    ethereum: "https://etherscan.io"
  };

  return baseUrls[blockchain];
}

function extractFilledTxHashes(value: unknown): string[] {
  const record = asRecord(value);
  const direct = record?.filledTxHashes;
  const nested = asRecord(record?.data)?.filledTxHashes;
  const hashes = Array.isArray(direct) ? direct : nested;

  return Array.isArray(hashes)
    ? hashes.filter((hash): hash is string => typeof hash === "string")
    : [];
}

function extractOrderStatus(value: unknown): string | null {
  const record = asRecord(value);
  const direct = record?.status;
  const nested = asRecord(record?.data)?.status;

  if (typeof direct === "string") {
    return direct;
  }

  return typeof nested === "string" ? nested : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export type { ToolDefinition };
export type { JsonObject };
