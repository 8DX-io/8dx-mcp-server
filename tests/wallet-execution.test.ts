import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EightDxConfig } from "../src/types.js";

const walletConnectMocks = vi.hoisted(() => {
  const connect = vi.fn(async () => ({
    approval: () => new Promise<never>(() => {}),
    uri: "wc:test@2?relay-protocol=irn&symKey=key"
  }));
  const disconnect = vi.fn();
  const init = vi.fn(async () => ({ connect, disconnect, request: vi.fn() }));

  return { connect, disconnect, init };
});

vi.mock("@walletconnect/sign-client", () => ({
  SignClient: {
    init: walletConnectMocks.init
  }
}));

import { createWalletExecution } from "../src/wallet-execution.js";

function createConfig(): EightDxConfig {
  return {
    apiBaseUrl: "https://swap.ggp.gg",
    localSigner: {
      enabled: false,
      rpcUrls: {}
    },
    requestTimeoutMs: 30_000,
    walletConnect: {
      metadata: {
        description: "Test description",
        icons: [],
        name: "Test 8DX",
        url: "https://example.test"
      },
      projectId: "project-id"
    }
  };
}

describe("createWalletExecution", () => {
  beforeEach(() => {
    walletConnectMocks.connect.mockClear();
    walletConnectMocks.disconnect.mockClear();
    walletConnectMocks.init.mockClear();
  });

  it("creates WalletConnect session URIs with the SignClient named export", async () => {
    const execution = createWalletExecution(createConfig());

    const result = (await execution.walletConnect.createSession({ blockchain: "ethereum" })) as {
      available: boolean;
      deeplinks: { metamask: string };
      status: string;
      uri: string;
    };

    expect(walletConnectMocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: createConfig().walletConnect.metadata,
        projectId: "project-id"
      })
    );
    expect(walletConnectMocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredNamespaces: {
          eip155: expect.objectContaining({
            chains: ["eip155:1"],
            methods: expect.arrayContaining(["eth_sendTransaction"])
          })
        }
      })
    );
    expect(result).toMatchObject({
      available: true,
      status: "pending",
      uri: "wc:test@2?relay-protocol=irn&symKey=key"
    });
    expect(result.deeplinks.metamask).toContain("https://metamask.app.link/wc?uri=");
  });
});
