# 8DX MCP Server

MCP server that exposes 8DX DEX aggregator REST endpoints as tools for AI agents.

The server is a thin TypeScript wrapper around the 8DX REST API. It does not hold keys,
does not sign messages, does not custody funds, and does not send on-chain transactions.

## Tools

Supported `blockchain` value for quote, swap, and limit-order tools: `ethereum`.
Permit helper tools currently support `ethereum` and `bsc`.

### Quotes and swaps

| Tool                                                              | Description                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `eightdx_health`<br><sub>`GET /api/health`</sub>                  | Checks whether the 8DX API is reachable and responding normally.                                                           |
| `eightdx_get_quote`<br><sub>`GET /api/{blockchain}/quote`</sub>   | Performs a read-only quote lookup for an exact token pair and amount.                                                      |
| `eightdx_create_swap`<br><sub>`POST /api/{blockchain}/swap`</sub> | Returns swap calldata for a previously quoted path. The server does not sign, custody funds, or broadcast the transaction. |

### Permit helpers

| Tool                                                                              | Description                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `eightdx_get_permit_address`<br><sub>`GET /api/{blockchain}/permit/address`</sub> | Reads the permit contract address used by the selected blockchain.                                     |
| `eightdx_get_permit_data`<br><sub>`GET /api/{blockchain}/permit/data`</sub>       | Returns permit data that a wallet or agent can inspect and sign externally. The server never signs it. |

### Limit orders

| Tool                                                                                                   | Description                                                                   |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `eightdx_create_limit_order`<br><sub>`POST /api/{blockchain}/order`</sub>                              | Submits an order payload that has already been signed outside the MCP server. |
| `eightdx_get_limit_orders_by_maker`<br><sub>`GET /api/{blockchain}/orders/byMaker/{maker}`</sub>       | Reads active limit orders for a maker address.                                |
| `eightdx_get_limit_order_history`<br><sub>`GET /api/{blockchain}/orders/byMaker/history/{maker}`</sub> | Reads historical limit orders for a maker address.                            |
| `eightdx_cancel_limit_order`<br><sub>`POST /api/{blockchain}/orders/cancel`</sub>                      | Submits a cancel payload that has already been signed outside the MCP server. |

## Install

```bash
npm install -g @8dx/8dx-mcp-server
```

Or run it directly:

```bash
npx -y @8dx/8dx-mcp-server
```

## Configuration

| Environment variable         | Default                     | Description                      |
| ---------------------------- | --------------------------- | -------------------------------- |
| `EIGHTDX_API_BASE_URL`       | `https://dev-london.8dx.io` | 8DX REST API base URL.           |
| `EIGHTDX_REQUEST_TIMEOUT_MS` | `30000`                     | Request timeout in milliseconds. |

All outgoing 8DX REST API requests include:

```http
X-Source: 8dx-mcp/0.1.0
```

This lets the 8DX backend distinguish MCP traffic from direct API usage.

## Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "8dx": {
      "command": "npx",
      "args": ["-y", "@8dx/8dx-mcp-server"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://dev-london.8dx.io"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add 8dx --transport stdio -- npx -y @8dx/8dx-mcp-server
```

## OpenAI Codex

Codex CLI can register this server as a stdio MCP server with `codex mcp add`.

### Local development

Use this while developing the server before it is published to npm.

Build the server first:

```bash
cd /absolute/path/to/8dx-mcp-server
npm install
npm run build
```

Then add the local server to Codex:

```bash
codex mcp add 8dx-local \
  --env EIGHTDX_API_BASE_URL=https://dev-london.8dx.io \
  --env EIGHTDX_REQUEST_TIMEOUT_MS=30000 \
  -- node /absolute/path/to/8dx-mcp-server/dist/index.js
```

Confirm that Codex can see the server:

```bash
codex mcp list
codex mcp get 8dx-local
```

### Published package

After the package is published to npm, use `npx` instead of the local `node` path:

```bash
codex mcp add 8dx \
  --env EIGHTDX_API_BASE_URL=https://dev-london.8dx.io \
  --env EIGHTDX_REQUEST_TIMEOUT_MS=30000 \
  -- npx -y @8dx/8dx-mcp-server
```

## Cursor

Cursor supports project-level and global MCP configuration:

- Project-level: create `.cursor/mcp.json` in the project root.
- Global: create `~/.cursor/mcp.json`.

### Local development

Use this while developing the server before it is published to npm.

Build the server first:

```bash
cd /absolute/path/to/8dx-mcp-server
npm install
npm run build
```

Then create or update `.cursor/mcp.json` in the project where you want to use the 8DX tools:

```json
{
  "mcpServers": {
    "8dx-local": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/8dx-mcp-server/dist/index.js"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://dev-london.8dx.io",
        "EIGHTDX_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

Restart Cursor, open Cursor Settings, go to MCP, and confirm that `8dx-local` is enabled.

Try these prompts in Cursor chat:

```text
Call the 8DX health tool.
```

```text
Use 8DX to get a quote on ethereum from WETH to USDC.
```

For quote testing, pass exact token identifiers and amount format accepted by the 8DX API.

### Published package

After the package is published to npm, use `npx` instead of the local `node` path:

```json
{
  "mcpServers": {
    "8dx": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@8dx/8dx-mcp-server"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://dev-london.8dx.io",
        "EIGHTDX_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

If Cursor does not show the tools, run `npm run build` again, restart Cursor, and check that the
absolute path in `args` points to an existing `dist/index.js` file.

See `examples/` for ready-to-copy local MCP config templates.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run smoke:stdio
npm run dev
```

## Safety

This MCP server only calls the 8DX REST API. It does not provide financial advice. Agents and
users must inspect all swap calldata, permit data, signatures, and order payloads before using them
with a wallet or broadcasting anything on-chain.

## License

MIT
