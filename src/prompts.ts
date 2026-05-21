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
    "- Do not claim to hold wallet keys. WalletConnect requests ask the user's wallet to sign and broadcast only after wallet approval; MCP-side/local signing is allowed only when eightdx_local_signer_status says enabled and the user explicitly requested local MCP signing.",
    "- Market swaps are WalletConnect-first. Call eightdx_get_wallet_session and eightdx_walletconnect_get_session before asking for a manual wallet address.",
    "- Resolve or ask for the target chain before creating a WalletConnect session; use a default chain only after explicit user acceptance.",
    "- If no WalletConnect account is connected for the resolved chain, call eightdx_walletconnect_create_session and show the URI/deeplink so the user can connect their wallet.",
    "- After WalletConnect connects, treat the connected WalletConnect account as the wallet session. Call eightdx_login_wallet with that public address, chain, surface, and wallet app when known.",
    "- For normal self-swaps, use the connected WalletConnect account as both fromAddress and dstAddress. Ask before using any different recipient.",
    "- If WalletConnect is unavailable, explain that direct wallet confirmation requires EIGHTDX_WALLETCONNECT_PROJECT_ID, then offer wallet handoff links only as a fallback.",
    "- If the user's request names tokens by symbol or common name, call eightdx_search_tokens before quoting.",
    "- If the request is missing sell token, buy token, amount, chain, slippage, or deadline, ask a follow-up question before creating calldata.",
    "- Always show a quote first with eightdx_preview_market_swap. Refresh it if older than 30 seconds.",
    "- Only after explicit user confirmation call eightdx_create_swap with the confirmed quote path, slippage, deadline, and the connected wallet as both sender and destination for self-swaps.",
    "- Show the transaction fields, then call eightdx_wallet_send_transaction with confirmedByUser true so the connected wallet can display, sign, and broadcast after the user approves.",
    "- Use eightdx_local_sign_and_send_transaction only when eightdx_local_signer_status says enabled and the user explicitly asks this MCP server to sign and send.",
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
    "1. WalletConnect-first: call eightdx_get_wallet_session and eightdx_walletconnect_get_session.",
    "2. If no WalletConnect session is connected, resolve the chain from the request first; if the chain is missing, ask the user to choose one or explicitly accept a default chain before calling eightdx_walletconnect_create_session. Then show the URI/deeplink and ask the user to connect in their wallet.",
    "3. After the user connects, call eightdx_walletconnect_get_session again with a wait window. Treat the connected WalletConnect account as the wallet session, then call eightdx_login_wallet with that public address, chain, surface, and wallet app when known.",
    "4. Parse the request. For 'bitcoin' or 'BTC', call eightdx_search_tokens; prefer WBTC only after showing the resolved token and chain to the user.",
    "5. If the output token is missing, Ask a follow-up question such as 'What do you want to receive: USDC, ETH, USDT, or another token?'",
    "6. If amount, chain, slippage, or deadline are missing, ask for them. Use a default chain only after explicit user acceptance; use conservative slippage or deadline defaults only after telling the user.",
    "7. Call eightdx_preview_market_swap with dstAddress set to the connected wallet. Show the quote, expected output, price impact if present, refreshAfterSeconds, slippage, deadline, route, and WalletConnect execution context.",
    "8. Refresh the preview if it is older than 30 seconds before asking for transaction confirmation.",
    "9. Ask for explicit confirmation after the fresh quote and before creating calldata.",
    "10. Call eightdx_create_swap with the quoted path, slippage, deadline, and fromAddress and dstAddress to the connected wallet for a self-swap unless the user explicitly requested another recipient.",
    "11. Show the send-tool fields returned by eightdx_create_swap or prepared for eightdx_wallet_send_transaction: blockchain, to, data, value, and fromAddress. Also show sender and recipient labels if available.",
    "12. Call eightdx_wallet_send_transaction with confirmedByUser true; the connected wallet signs and broadcasts only after the user approves in the wallet UI.",
    "13. After a transaction hash is returned, call eightdx_build_explorer_link for the scanner URL.",
    "14. If WalletConnect is unavailable, say direct wallet confirmation requires EIGHTDX_WALLETCONNECT_PROJECT_ID and offer walletLinks.metamaskMobileDappUrl/webUrl or routeLink.url as fallback web handoff links.",
    "15. Use eightdx_local_sign_and_send_transaction only if eightdx_local_signer_status is enabled and the user explicitly requested MCP-side signing. Otherwise do not sign inside the MCP server.",
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
    "2. For direct wallet requests, call eightdx_walletconnect_create_session and then eightdx_walletconnect_get_session once the user connects.",
    "3. Resolve token symbols with eightdx_search_tokens when needed.",
    "4. Explain that this MCP server can submit only an externally signed limit-order payload.",
    "5. Ask the wallet/client layer to produce the signed order params: makerTraits, makingAmount, takingAmount, salt, signature, and optional extension.",
    "6. Submit with eightdx_create_limit_order only after the user confirms the signed payload.",
    "7. Show the returned order hash, then use eightdx_get_order_status or eightdx_get_limit_order_history to track status.",
    "8. For fills, show scanner links for filled transaction hashes.",
    "",
    "Do not create signatures inside the MCP server."
  ].join("\n");
}
