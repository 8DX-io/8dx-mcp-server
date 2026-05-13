import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import type { EightDxClient, JsonObject } from "./types.js";

type ToolDefinition = {
  description: string;
  handler(input: Record<string, unknown>): Promise<CallToolResult>;
  inputSchema: ZodRawShape;
  name: string;
  title: string;
};

const blockchainSchema = z
  .enum(["ethereum", "bsc", "arbitrum"])
  .describe("Blockchain network supported by the 8DX API.");

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

export function createEightDxToolDefinitions(client: EightDxClient): ToolDefinition[] {
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
        "Gets an 8DX swap quote for a token pair and amount. This is a read-only operation.",
      handler: async (input) => toJsonToolResult(await client.getQuote(parseQuoteInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        addressTokenIn: addressSchema("Token address or native-token identifier to sell."),
        addressTokenOut: addressSchema("Token address or native-token identifier to buy."),
        amountIn: amountSchema("Amount of the input token to quote.")
      },
      name: "eightdx_get_quote",
      title: "Get 8DX Quote"
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
        toJsonToolResult(await client.getPermitAddress(parseBlockchainInput(input))),
      inputSchema: {
        blockchain: blockchainSchema
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
        blockchain: blockchainSchema,
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
      description: "Gets an 8DX limit order by order hash.",
      handler: async (input) =>
        toJsonToolResult(await client.getLimitOrderByHash(parseOrderByHashInput(input))),
      inputSchema: {
        blockchain: blockchainSchema,
        orderHash: z.string().min(1).describe("8DX order hash.")
      },
      name: "eightdx_get_limit_order_by_hash",
      title: "Get 8DX Limit Order By Hash"
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
    }
  ];
}

export function registerEightDxTools(server: McpServer, client: EightDxClient): void {
  for (const tool of createEightDxToolDefinitions(client)) {
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
      amountIn: z.string().min(1)
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

function parseBlockchainInput(input: Record<string, unknown>) {
  return z.object({ blockchain: blockchainSchema }).parse(input);
}

function parsePermitDataInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
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

function parseOrderByHashInput(input: Record<string, unknown>) {
  return z
    .object({
      blockchain: blockchainSchema,
      orderHash: z.string().min(1)
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

export type { ToolDefinition };
export type { JsonObject };
