# Contributing

Thanks for helping improve the 8DX MCP Server.

## Local Setup

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Pull Requests

- Keep changes focused.
- Add or update tests for tool behavior, REST request construction, and config changes.
- Do not add wallet signing, key management, or transaction broadcasting logic to this server.
- Keep tool descriptions clear enough for LLMs to call safely.

## API Changes

The 8DX OpenAPI documentation is the source of truth for REST routes and payload shape. When the API
changes, update schemas, tests, and README examples together.
