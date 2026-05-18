#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { access } from "node:fs/promises";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedToolNames = [
  "eightdx_health",
  "eightdx_get_quote",
  "eightdx_create_swap",
  "eightdx_get_permit_address",
  "eightdx_get_permit_data",
  "eightdx_create_limit_order",
  "eightdx_get_limit_orders_by_maker",
  "eightdx_get_limit_order_history",
  "eightdx_cancel_limit_order"
];

await access("dist/index.js");

const serverEnv = {
  PATH: process.env.PATH ?? ""
};

if (process.env.EIGHTDX_API_BASE_URL) {
  serverEnv.EIGHTDX_API_BASE_URL = process.env.EIGHTDX_API_BASE_URL;
}

if (process.env.EIGHTDX_REQUEST_TIMEOUT_MS) {
  serverEnv.EIGHTDX_REQUEST_TIMEOUT_MS = process.env.EIGHTDX_REQUEST_TIMEOUT_MS;
}

const client = new Client({ name: "8dx-stdio-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: serverEnv,
  stderr: "pipe"
});

const stderrChunks = [];
transport.stderr?.on("data", (chunk) => {
  stderrChunks.push(Buffer.from(chunk).toString("utf8"));
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const actualToolNames = tools.tools.map((tool) => tool.name);
  const missingToolNames = expectedToolNames.filter(
    (toolName) => !actualToolNames.includes(toolName)
  );

  if (missingToolNames.length > 0) {
    throw new Error(`Missing MCP tools: ${missingToolNames.join(", ")}`);
  }

  const health = await client.callTool({ name: "eightdx_health", arguments: {} });
  const ethereumPermit = await client.callTool({
    name: "eightdx_get_permit_address",
    arguments: { blockchain: "ethereum" }
  });
  const bscPermit = await client.callTool({
    name: "eightdx_get_permit_address",
    arguments: { blockchain: "bsc" }
  });
  const quote = await client.callTool({
    name: "eightdx_get_quote",
    arguments: {
      blockchain: "ethereum",
      addressTokenIn: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      addressTokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      amountIn: "1000000"
    }
  });
  const quoteBody = parseToolJson(quote, "eightdx_get_quote");

  if (!quoteBody.data) {
    throw new Error("eightdx_get_quote returned no route data for the live smoke pair.");
  }

  const swap = await client.callTool({
    name: "eightdx_create_swap",
    arguments: {
      blockchain: "ethereum",
      dstAddress: "0x0000000000000000000000000000000000000000",
      path: quoteBody.data,
      skipSimulation: true,
      slippageBps: 50
    }
  });
  const swapBody = parseToolJson(swap, "eightdx_create_swap");

  if (typeof swapBody.data !== "string" || !swapBody.data.startsWith("0x")) {
    throw new Error("eightdx_create_swap returned invalid calldata.");
  }

  const ordersByMaker = await client.callTool({
    name: "eightdx_get_limit_orders_by_maker",
    arguments: { blockchain: "ethereum", maker: "0x0000000000000000000000000000000000000000" }
  });
  const orderHistory = await client.callTool({
    name: "eightdx_get_limit_order_history",
    arguments: {
      blockchain: "ethereum",
      maker: "0x0000000000000000000000000000000000000000",
      limit: 10,
      offset: 0,
      sort: "desc"
    }
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        toolCount: actualToolNames.length,
        health: health.content,
        ethereumPermitAddress: ethereumPermit.content,
        bscPermitAddress: bscPermit.content,
        quote: {
          totalAmountOut: quoteBody.data.totalAmountOut,
          stepGroups: quoteBody.data.steps.length
        },
        swap: {
          calldataBytes: (swapBody.data.length - 2) / 2,
          minReturnAmountOut: swapBody.minReturnAmountOut
        },
        ordersByMaker: ordersByMaker.content,
        orderHistory: orderHistory.content
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
