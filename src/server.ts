import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig } from "./config.js";
import { registerEightDxPrompts } from "./prompts.js";
import { EightDxRestClient } from "./rest-client.js";
import { registerEightDxTools } from "./tools.js";
import type { EightDxClient, EightDxConfig } from "./types.js";
import { PACKAGE_VERSION } from "./version.js";
import { createWalletExecution, type WalletExecution } from "./wallet-execution.js";

export function createEightDxMcpServer(options?: {
  client?: EightDxClient;
  config?: EightDxConfig;
  walletExecution?: WalletExecution;
}): McpServer {
  const server = new McpServer({
    name: "8dx-mcp-server",
    version: PACKAGE_VERSION
  });
  const config = options?.config ?? loadConfig();
  const client = options?.client ?? new EightDxRestClient(config);
  const walletExecution = options?.walletExecution ?? createWalletExecution(config);

  registerEightDxTools(server, client, { walletExecution });
  registerEightDxPrompts(server);

  return server;
}
