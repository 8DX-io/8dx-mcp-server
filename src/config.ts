import type { EightDxConfig } from "./types.js";

export const DEFAULT_API_BASE_URL = "https://dev-london.8dx.io";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EightDxConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(env.EIGHTDX_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    requestTimeoutMs: parsePositiveInteger(
      env.EIGHTDX_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS
    )
  };
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
