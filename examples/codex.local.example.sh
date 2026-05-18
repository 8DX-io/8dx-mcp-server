#!/usr/bin/env bash
set -euo pipefail

codex mcp add 8dx-local \
  --env EIGHTDX_API_BASE_URL=https://swap.ggp.gg \
  --env EIGHTDX_REQUEST_TIMEOUT_MS=30000 \
  -- node /absolute/path/to/8dx-mcp-server/dist/index.js
