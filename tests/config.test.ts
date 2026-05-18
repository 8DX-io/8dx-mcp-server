import { describe, expect, it } from "vitest";

import { DEFAULT_API_BASE_URL, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses the public 8DX production API by default", () => {
    expect(DEFAULT_API_BASE_URL).toBe("https://swap.ggp.gg");
    expect(loadConfig({}).apiBaseUrl).toBe("https://swap.ggp.gg");
  });

  it("uses EIGHTDX_API_BASE_URL and removes trailing slashes", () => {
    expect(loadConfig({ EIGHTDX_API_BASE_URL: "https://api.example.test///" }).apiBaseUrl).toBe(
      "https://api.example.test"
    );
  });

  it("uses EIGHTDX_REQUEST_TIMEOUT_MS when it is a positive integer", () => {
    expect(loadConfig({ EIGHTDX_REQUEST_TIMEOUT_MS: "15000" }).requestTimeoutMs).toBe(15_000);
  });
});
