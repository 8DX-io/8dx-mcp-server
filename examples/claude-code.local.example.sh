#!/usr/bin/env bash
set -euo pipefail

claude mcp add 8dx-local --transport stdio -- node /absolute/path/to/8dx-mcp-server/dist/index.js
