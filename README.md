# 8DX MCP Server

MCP server that exposes 8DX DEX aggregator REST endpoints as tools for AI agents.

The server is a thin TypeScript wrapper around the 8DX REST API. It does not hold keys,
does not sign messages, does not custody funds, and does not send on-chain transactions.

## Tools

| Tool                                | REST route                                             | Notes                                                                 |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `eightdx_health`                    | `GET /api/health`                                      | Checks API health.                                                    |
| `eightdx_get_quote`                 | `GET /api/{blockchain}/quote`                          | Read-only quote lookup.                                               |
| `eightdx_create_swap`               | `POST /api/{blockchain}/swap`                          | Returns swap calldata from a quoted path. Does not sign or broadcast. |
| `eightdx_get_permit_address`        | `GET /api/{blockchain}/permit/address`                 | Reads permit contract address.                                        |
| `eightdx_get_permit_data`           | `GET /api/{blockchain}/permit/data`                    | Returns permit data to sign. Does not sign.                           |
| `eightdx_create_limit_order`        | `POST /api/{blockchain}/order`                         | Submits an already signed order payload.                              |
| `eightdx_get_limit_orders_by_maker` | `GET /api/{blockchain}/orders/byMaker/{maker}`         | Reads active orders.                                                  |
| `eightdx_get_limit_order_history`   | `GET /api/{blockchain}/orders/byMaker/history/{maker}` | Reads order history.                                                  |
| `eightdx_get_limit_order_by_hash`   | `GET /api/{blockchain}/orders/{order_hash}`            | Reads one order.                                                      |
| `eightdx_cancel_limit_order`        | `POST /api/{blockchain}/orders/cancel`                 | Submits an already signed cancel payload.                             |

Supported `blockchain` values: `ethereum`, `bsc`, `arbitrum`.

## Install

```bash
npm install -g @planet9group/8dx-mcp-server
```

Or run it directly:

```bash
npx -y @planet9group/8dx-mcp-server
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
      "args": ["-y", "@planet9group/8dx-mcp-server"],
      "env": {
        "EIGHTDX_API_BASE_URL": "https://dev-london.8dx.io"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add 8dx --transport stdio -- npx -y @planet9group/8dx-mcp-server
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
      "args": ["-y", "@planet9group/8dx-mcp-server"],
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
npm run dev
```

## Safety

This MCP server only calls the 8DX REST API. It does not provide financial advice. Agents and
users must inspect all swap calldata, permit data, signatures, and order payloads before using them
with a wallet or broadcasting anything on-chain.

## License

MIT
