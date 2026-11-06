import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_API_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from "../src/config.js";

const readJson = (name: string) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

describe("MCP Registry metadata", () => {
  it("keeps the npm ownership identifier and published version aligned", () => {
    const pkg = readJson("package.json");
    const lock = readJson("package-lock.json");
    const server = readJson("server.json");
    expect(server.name).toBe("io.github.8DX-io/8dx-mcp-server");
    expect(pkg.mcpName).toBe(server.name);
    expect(server.version).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
    expect(server.packages).toHaveLength(1);
    expect(server.packages[0]).toMatchObject({
      registryType: "npm",
      identifier: pkg.name,
      version: pkg.version,
      transport: { type: "stdio" }
    });
    expect(pkg.files).toContain("server.json");
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.remotes).toBeUndefined();
  });

  it("advertises existing non-secret defaults without enabling local signing", () => {
    const server = readJson("server.json");
    const variables = server.packages[0].environmentVariables;
    expect(variables).toEqual([
      expect.objectContaining({
        name: "EIGHTDX_API_BASE_URL",
        default: DEFAULT_API_BASE_URL,
        isRequired: false,
        isSecret: false
      }),
      expect.objectContaining({
        name: "EIGHTDX_REQUEST_TIMEOUT_MS",
        default: String(DEFAULT_REQUEST_TIMEOUT_MS),
        isRequired: false,
        isSecret: false
      })
    ]);
  });
});
