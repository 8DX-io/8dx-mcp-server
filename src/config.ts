import type { EightDxConfig } from "./types.js";

export const DEFAULT_API_BASE_URL = "https://swap.ggp.gg";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EightDxConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(env.EIGHTDX_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    localSigner: {
      enabled: env.EIGHTDX_ENABLE_LOCAL_SIGNER === "true",
      privateKey: parsePrivateKey(env.EIGHTDX_SIGNER_PRIVATE_KEY),
      rpcUrls: parseRpcUrls(env)
    },
    requestTimeoutMs: parsePositiveInteger(
      env.EIGHTDX_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
    walletConnect: {
      metadata: {
        description:
          env.EIGHTDX_WALLETCONNECT_METADATA_DESCRIPTION ?? "8DX MCP server wallet connection",
        icons: parseCsv(env.EIGHTDX_WALLETCONNECT_METADATA_ICONS),
        name: env.EIGHTDX_WALLETCONNECT_METADATA_NAME ?? "8DX MCP",
        url: env.EIGHTDX_WALLETCONNECT_METADATA_URL ?? "https://8dx.io"
      },
      projectId: parseNonEmptyString(env.EIGHTDX_WALLETCONNECT_PROJECT_ID),
      relayUrl: parseOptionalUrl(env.EIGHTDX_WALLETCONNECT_RELAY_URL)
    }
  };
}

function parseRpcUrls(env: NodeJS.ProcessEnv): EightDxConfig["localSigner"]["rpcUrls"] {
  const entries: Array<[keyof EightDxConfig["localSigner"]["rpcUrls"], string | undefined]> = [
    ["arbitrum", parseOptionalUrl(env.EIGHTDX_ARBITRUM_RPC_URL)],
    ["bsc", parseOptionalUrl(env.EIGHTDX_BSC_RPC_URL)],
    ["ethereum", parseOptionalUrl(env.EIGHTDX_ETHEREUM_RPC_URL ?? env.EIGHTDX_RPC_URL)]
  ];

  return Object.fromEntries(entries.filter(([, url]) => url !== undefined));
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parseNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalUrl(value: string | undefined): string | undefined {
  const trimmed = parseNonEmptyString(value);
  return trimmed ? normalizeBaseUrl(trimmed) : undefined;
}

function parsePrivateKey(value: string | undefined): `0x${string}` | undefined {
  const trimmed = parseNonEmptyString(value);
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed ?? "") ? (trimmed as `0x${string}`) : undefined;
}
