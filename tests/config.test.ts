import { describe, expect, it } from "vitest";

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_WALLETCONNECT_PROJECT_ID,
  loadConfig
} from "../src/config.js";

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

  it("enables WalletConnect by default and keeps local signing disabled", () => {
    const config = loadConfig({});

    expect(DEFAULT_WALLETCONNECT_PROJECT_ID).toBe("84b7f6d4d35af61bdd71ddf1b3cfca5f");
    expect(config.walletConnect.projectId).toBe(DEFAULT_WALLETCONNECT_PROJECT_ID);
    expect(config.localSigner).toMatchObject({
      enabled: false,
      rpcUrls: {}
    });
    expect(config.localSigner.privateKey).toBeUndefined();
  });

  it("loads WalletConnect and opt-in local signer settings from env", () => {
    const config = loadConfig({
      EIGHTDX_ENABLE_LOCAL_SIGNER: "true",
      EIGHTDX_ETHEREUM_RPC_URL: "https://rpc.example.test///",
      EIGHTDX_SIGNER_PRIVATE_KEY:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      EIGHTDX_WALLETCONNECT_METADATA_DESCRIPTION: "Test description",
      EIGHTDX_WALLETCONNECT_METADATA_ICONS: "https://example.test/icon.png",
      EIGHTDX_WALLETCONNECT_METADATA_NAME: "Test 8DX",
      EIGHTDX_WALLETCONNECT_METADATA_URL: "https://example.test",
      EIGHTDX_WALLETCONNECT_PROJECT_ID: "project-id",
      EIGHTDX_WALLETCONNECT_RELAY_URL: "wss://relay.example.test///"
    });

    expect(config.walletConnect).toEqual({
      metadata: {
        description: "Test description",
        icons: ["https://example.test/icon.png"],
        name: "Test 8DX",
        url: "https://example.test"
      },
      projectId: "project-id",
      relayUrl: "wss://relay.example.test"
    });
    expect(config.localSigner).toEqual({
      enabled: true,
      privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rpcUrls: {
        ethereum: "https://rpc.example.test"
      }
    });
  });

  it("ignores invalid local signer private keys", () => {
    const config = loadConfig({
      EIGHTDX_ENABLE_LOCAL_SIGNER: "true",
      EIGHTDX_SIGNER_PRIVATE_KEY: "0xabc123"
    });

    expect(config.localSigner.privateKey).toBeUndefined();
  });
});
