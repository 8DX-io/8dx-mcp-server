import SignClient from "@walletconnect/sign-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, bsc, mainnet } from "viem/chains";

import type { Blockchain, EightDxConfig } from "./types.js";

export type WalletTransactionInput = {
  blockchain: Blockchain;
  confirmedByUser: boolean;
  data: string;
  fromAddress?: string | null | undefined;
  requestLabel?: string | null | undefined;
  to: string;
  value: string;
};

export type WalletConnectExecution = {
  createSession(input: { blockchain: Blockchain }): Promise<unknown>;
  disconnect(): Promise<unknown>;
  getSession(input?: { waitMs?: number | undefined }): Promise<unknown>;
  sendTransaction(input: WalletTransactionInput): Promise<unknown>;
};

export type LocalSignerExecution = {
  getStatus(): unknown;
  signAndSendTransaction(input: WalletTransactionInput): Promise<unknown>;
};

export type WalletExecution = {
  localSigner: LocalSignerExecution;
  walletConnect: WalletConnectExecution;
};

type WalletConnectConfig = EightDxConfig["walletConnect"];
type LocalSignerConfig = EightDxConfig["localSigner"];

const CHAIN_IDS: Record<Blockchain, number> = {
  arbitrum: 42161,
  bsc: 56,
  ethereum: 1
};

export function createWalletExecution(config: EightDxConfig): WalletExecution {
  return {
    localSigner: createLocalSignerExecution(config.localSigner),
    walletConnect: createWalletConnectExecution(config.walletConnect)
  };
}

export function createDisabledWalletExecution(): WalletExecution {
  return {
    localSigner: {
      getStatus: () => ({
        enabled: false,
        reason:
          "Local signer disabled. Set EIGHTDX_ENABLE_LOCAL_SIGNER=true with signer key and RPC URL."
      }),
      signAndSendTransaction: async () => {
        throw new Error("Local signer is disabled.");
      }
    },
    walletConnect: {
      createSession: async () => ({
        available: false,
        reason: "WalletConnect disabled. Set EIGHTDX_WALLETCONNECT_PROJECT_ID to enable it.",
        status: "unavailable"
      }),
      disconnect: async () => ({ connected: false, status: "disconnected" }),
      getSession: async () => ({
        available: false,
        connected: false,
        reason: "WalletConnect disabled. Set EIGHTDX_WALLETCONNECT_PROJECT_ID to enable it.",
        status: "unavailable"
      }),
      sendTransaction: async () => {
        throw new Error("WalletConnect is disabled.");
      }
    }
  };
}

function createWalletConnectExecution(config: WalletConnectConfig): WalletConnectExecution {
  if (!config.projectId) {
    return createDisabledWalletExecution().walletConnect;
  }

  const projectId = config.projectId;
  let clientPromise: Promise<Awaited<ReturnType<typeof SignClient.init>>> | null = null;
  let approvalPromise: Promise<WalletConnectSession> | null = null;
  let activeSession: WalletConnectSession | null = null;

  const getClient = () => {
    clientPromise ??= SignClient.init({
      metadata: config.metadata,
      projectId,
      ...(config.relayUrl ? { relayUrl: config.relayUrl } : {})
    });

    return clientPromise;
  };

  return {
    async createSession(input) {
      const client = await getClient();
      const chainId = toWalletConnectChainId(input.blockchain);
      const response = await client.connect({
        requiredNamespaces: {
          eip155: {
            chains: [chainId],
            events: ["accountsChanged", "chainChanged"],
            methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"]
          }
        }
      });

      approvalPromise = response.approval().then((session) => {
        activeSession = session;
        return session;
      });

      return {
        accounts: [],
        available: true,
        deeplinks: {
          metamask: response.uri ? buildMetaMaskWalletConnectLink(response.uri) : null
        },
        status: "pending",
        uri: response.uri ?? null
      };
    },

    async disconnect() {
      const client = await getClient();
      if (activeSession) {
        await client.disconnect({
          reason: { code: 6000, message: "User disconnected" },
          topic: activeSession.topic
        });
      }

      activeSession = null;
      approvalPromise = null;

      return { connected: false, status: "disconnected" };
    },

    async getSession(input) {
      if (approvalPromise && !activeSession && (input?.waitMs ?? 0) > 0) {
        await settleWithin(approvalPromise, input?.waitMs ?? 0);
      }

      if (!activeSession) {
        return {
          available: true,
          connected: false,
          status: approvalPromise ? "pending" : "disconnected"
        };
      }

      const accounts = getWalletConnectAccounts(activeSession);
      const firstAccount = accounts[0];
      const parsedAccount = firstAccount ? parseWalletConnectAccount(firstAccount) : null;

      return {
        accounts,
        address: parsedAccount?.address ?? null,
        available: true,
        blockchain: parsedAccount ? fromWalletConnectChainId(parsedAccount.chainId) : null,
        connected: true,
        status: "connected",
        topic: activeSession.topic
      };
    },

    async sendTransaction(input) {
      assertConfirmed(input.confirmedByUser);
      if (!activeSession) {
        throw new Error("WalletConnect session is not connected.");
      }

      const account =
        input.fromAddress ??
        parseWalletConnectAccount(getWalletConnectAccounts(activeSession)[0])?.address;
      if (!account) {
        throw new Error("WalletConnect session has no account for transaction.");
      }

      const client = await getClient();
      const txHash = await client.request<string>({
        chainId: toWalletConnectChainId(input.blockchain),
        request: {
          method: "eth_sendTransaction",
          params: [
            {
              data: input.data,
              from: account,
              to: input.to,
              value: toRpcQuantity(input.value)
            }
          ]
        },
        topic: activeSession.topic
      });

      return {
        mode: "walletconnect",
        requestLabel: input.requestLabel ?? null,
        txHash
      };
    }
  };
}

function createLocalSignerExecution(config: LocalSignerConfig): LocalSignerExecution {
  if (!config.enabled) {
    return createDisabledWalletExecution().localSigner;
  }

  const missingReason = getLocalSignerMissingReason(config);
  if (missingReason) {
    return {
      getStatus: () => ({
        enabled: false,
        reason: missingReason
      }),
      signAndSendTransaction: async () => {
        throw new Error(missingReason);
      }
    };
  }

  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(config.privateKey!);
  } catch {
    return {
      getStatus: () => ({
        enabled: false,
        reason: "Local signer enabled but EIGHTDX_SIGNER_PRIVATE_KEY is invalid."
      }),
      signAndSendTransaction: async () => {
        throw new Error("Local signer enabled but EIGHTDX_SIGNER_PRIVATE_KEY is invalid.");
      }
    };
  }

  return {
    getStatus: () => ({
      address: account.address,
      enabled: true,
      supportedBlockchains: Object.keys(config.rpcUrls).filter(
        (blockchain) => config.rpcUrls[blockchain as Blockchain]
      )
    }),
    async signAndSendTransaction(input) {
      assertConfirmed(input.confirmedByUser);
      const rpcUrl = config.rpcUrls[input.blockchain];
      if (!rpcUrl) {
        throw new Error(`No RPC URL configured for ${input.blockchain}.`);
      }

      const client = createWalletClient({
        account,
        chain: toViemChain(input.blockchain),
        transport: http(rpcUrl)
      });
      const txHash = await client.sendTransaction({
        data: input.data as `0x${string}`,
        to: input.to as `0x${string}`,
        value: BigInt(input.value)
      });

      return {
        mode: "local-signer",
        requestLabel: input.requestLabel ?? null,
        txHash
      };
    }
  };
}

export function assertConfirmed(confirmedByUser: boolean): void {
  if (confirmedByUser !== true) {
    throw new Error("confirmedByUser must be true before sending a transaction.");
  }
}

function getLocalSignerMissingReason(config: LocalSignerConfig): string | null {
  if (!config.privateKey) {
    return "Local signer enabled but EIGHTDX_SIGNER_PRIVATE_KEY is missing or invalid.";
  }
  if (!Object.values(config.rpcUrls).some(Boolean)) {
    return "Local signer enabled but no EIGHTDX_*_RPC_URL is configured.";
  }

  return null;
}

type WalletConnectSession = {
  namespaces: Record<string, { accounts?: string[] | undefined }>;
  topic: string;
};

function getWalletConnectAccounts(session: WalletConnectSession): string[] {
  return Object.values(session.namespaces).flatMap((namespace) => namespace.accounts ?? []);
}

function parseWalletConnectAccount(account: string | undefined): {
  address: string;
  chainId: string;
} | null {
  const [, chainId, address] = account?.split(":") ?? [];
  return chainId && address ? { address, chainId } : null;
}

function toWalletConnectChainId(blockchain: Blockchain): string {
  return `eip155:${CHAIN_IDS[blockchain]}`;
}

function fromWalletConnectChainId(chainId: string): Blockchain | null {
  const parsed = Number(chainId);
  const entry = Object.entries(CHAIN_IDS).find(([, value]) => value === parsed);
  return (entry?.[0] as Blockchain | undefined) ?? null;
}

function toViemChain(blockchain: Blockchain) {
  const chains = {
    arbitrum,
    bsc,
    ethereum: mainnet
  };

  return chains[blockchain];
}

function toRpcQuantity(value: string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function buildMetaMaskWalletConnectLink(uri: string): string {
  return `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
}

async function settleWithin<T>(promise: Promise<T>, waitMs: number): Promise<T | null> {
  if (waitMs <= 0) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), waitMs);
    })
  ]);
}
