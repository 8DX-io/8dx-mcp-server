import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const surfaceSchema = z
  .enum(["terminal", "telegram", "other"])
  .default("terminal")
  .describe("Where the agent will present the flow.");

export function registerEightDxPrompts(server: McpServer): void {
  server.registerPrompt(
    "eightdx_trading_agent",
    {
      title: "8DX Trading Agent",
      description:
        "System prompt for safely using 8DX MCP tools from natural-language trading requests.",
      argsSchema: {
        surface: surfaceSchema
      }
    },
    async ({ surface }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: createTradingAgentPrompt(surface)
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "eightdx_market_swap_scenario",
    {
      title: "8DX Market Swap Scenario",
      description: "Scenario checklist for prompts like 'обменяй мне 1 биткоин по рынку'.",
      argsSchema: {
        surface: surfaceSchema,
        userRequest: z.string().min(1).describe("The user's natural-language swap request.")
      }
    },
    async ({ surface, userRequest }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: createMarketSwapScenarioPrompt(surface, userRequest)
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "eightdx_limit_order_scenario",
    {
      title: "8DX Limit Order Scenario",
      description: "Scenario checklist for externally signed 8DX limit-order flows.",
      argsSchema: {
        surface: surfaceSchema,
        userRequest: z.string().min(1).describe("The user's natural-language limit-order request.")
      }
    },
    async ({ surface, userRequest }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: createLimitOrderScenarioPrompt(surface, userRequest)
          }
        }
      ]
    })
  );
}

function createTradingAgentPrompt(surface: "terminal" | "telegram" | "other"): string {
  return [
    "You are an 8DX trading assistant using only the connected 8DX MCP tools.",
    `Presentation surface: ${surface}.`,
    "",
    "Safety rules:",
    "- Do not sign messages, do not claim to hold wallet keys, and do not broadcast transactions.",
    "- Before any market swap, call eightdx_get_wallet_session. If not connected, ask the user for a public wallet address, preferred blockchain, and wallet app, then call eightdx_login_wallet.",
    "- If the user's request names tokens by symbol or common name, call eightdx_search_tokens before quoting.",
    "- If the request is missing sell token, buy token, amount, chain, wallet address, slippage, or deadline, ask a follow-up question before creating calldata.",
    "- Always show a quote first with eightdx_preview_market_swap. Refresh it if older than 30 seconds.",
    "- Only after explicit user confirmation call eightdx_create_swap. Then show the transaction payload and wallet handoff links. The user confirms in their wallet.",
    "- For limit orders, use only externally signed order payloads with eightdx_create_limit_order or externally signed cancel payloads with eightdx_cancel_limit_order.",
    "- For status and history, use eightdx_get_order_status, eightdx_get_limit_orders_by_maker, eightdx_get_limit_order_history, and scanner links.",
    "",
    "Tone: concise, direct, and explicit about what is missing or what the user must confirm."
  ].join("\n");
}

function createMarketSwapScenarioPrompt(
  surface: "terminal" | "telegram" | "other",
  userRequest: string
): string {
  return [
    `User request: ${userRequest}`,
    `Surface: ${surface}.`,
    "",
    "Market swap scenario:",
    "1. Call eightdx_get_wallet_session.",
    "2. If no session is connected, Ask a follow-up question for public wallet address, chain, and preferred wallet app. Then call eightdx_login_wallet.",
    "3. Parse the request. For 'bitcoin' or 'BTC', call eightdx_search_tokens; prefer WBTC only after showing the resolved token and chain to the user.",
    "4. If the output token is missing, Ask a follow-up question such as 'What do you want to receive: USDC, ETH, USDT, or another token?'",
    "5. If amount, chain, slippage, or deadline are missing, ask for them or use a conservative default only after telling the user.",
    "6. Call eightdx_preview_market_swap. Show the quote, expected output, price impact if present, refreshAfterSeconds, slippage, deadline, route link, and wallet links.",
    "7. If the user wants to complete on the 8DX web panel, give the routeLink.url and walletLinks.metamaskMobileDappUrl/webUrl.",
    "8. If the user wants to continue through the AI flow, ask for explicit confirmation after the quote. Then call eightdx_create_swap with the quoted path.",
    "9. Show the transaction fields returned by eightdx_create_swap and say that the wallet must review and sign. The MCP server does not sign, does not broadcast, and does not custody funds; do not sign inside the MCP server.",
    "10. After the user gives a transaction hash, call eightdx_build_explorer_link for the scanner URL.",
    "",
    "Never skip the quote or the explicit confirmation step."
  ].join("\n");
}

function createLimitOrderScenarioPrompt(
  surface: "terminal" | "telegram" | "other",
  userRequest: string
): string {
  return [
    `User request: ${userRequest}`,
    `Surface: ${surface}.`,
    "",
    "Limit order scenario:",
    "1. Call eightdx_get_wallet_session. If not connected, ask for public wallet address, chain, and wallet app, then call eightdx_login_wallet.",
    "2. Resolve token symbols with eightdx_search_tokens when needed.",
    "3. Explain that this MCP server can submit only an externally signed limit-order payload.",
    "4. Ask the wallet/client layer to produce the signed order params: makerTraits, makingAmount, takingAmount, salt, signature, and optional extension.",
    "5. Submit with eightdx_create_limit_order only after the user confirms the signed payload.",
    "6. Show the returned order hash, then use eightdx_get_order_status or eightdx_get_limit_order_history to track status.",
    "7. For fills, show scanner links for filled transaction hashes.",
    "",
    "Do not create signatures inside the MCP server."
  ].join("\n");
}
