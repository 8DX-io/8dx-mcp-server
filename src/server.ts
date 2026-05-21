import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig } from "./config.js";
import { registerEightDxPrompts } from "./prompts.js";
import { EightDxRestClient } from "./rest-client.js";
import { registerEightDxTools } from "./tools.js";
import type { EightDxClient, EightDxConfig } from "./types.js";
import { PACKAGE_VERSION } from "./version.js";

export function createEightDxMcpServer(options?: {
  client?: EightDxClient;
  config?: EightDxConfig;
}): McpServer {
  const server = new McpServer({
    name: "8dx-mcp-server",
    version: PACKAGE_VERSION
  });
  const client = options?.client ?? new EightDxRestClient(options?.config ?? loadConfig());

  registerEightDxTools(server, client);
  registerEightDxPrompts(server);

  return server;
}
