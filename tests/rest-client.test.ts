import { describe, expect, it } from "vitest";

import { EightDxApiError, EightDxRestClient } from "../src/rest-client.js";

function createJsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init
  });
}

describe("EightDxRestClient", () => {
  it("builds a quote request with blockchain path and query parameters", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse({ data: { totalAmountOut: "2" } });
    };
    const client = new EightDxRestClient(
      { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 1000 },
      fetchImpl
    );

    await client.getQuote({
      blockchain: "ethereum",
      addressTokenIn: "0xIn",
      addressTokenOut: "0xOut",
      amountIn: "1000000000000000000"
    });

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/ethereum/quote?addressTokenIn=0xIn&addressTokenOut=0xOut&amountIn=1000000000000000000"
    );
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("sends the MCP source header on outgoing API requests", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse("ok");
    };
    const client = new EightDxRestClient(
      { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 1000 },
      fetchImpl
    );

    await client.getHealth();

    expect(calls[0]?.init?.headers).toMatchObject({
      "X-Source": "8dx-mcp/0.1.0"
    });
  });

  it("posts swap requests as JSON", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse({ data: "0xcalldata", minReturnAmountOut: "42" });
    };
    const client = new EightDxRestClient(
      { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 1000 },
      fetchImpl
    );

    await client.createSwap({
      blockchain: "bsc",
      dstAddress: "0xWallet",
      path: {
        addressTokenIn: "0xIn",
        addressTokenOut: "0xOut",
        amountIn: "100",
        steps: [],
        totalAmountOut: "200",
        totalPriceImpact: 0
      }
    });

    expect(String(calls[0]?.input)).toBe("https://api.example.test/api/bsc/swap");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      dstAddress: "0xWallet",
      path: { amountIn: "100" }
    });
  });

  it("throws an API error with status and response body when 8DX rejects a request", async () => {
    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({ message: "bad request" }, { status: 400 });
    const client = new EightDxRestClient(
      { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 1000 },
      fetchImpl
    );

    await expect(client.getHealth()).rejects.toMatchObject({
      name: "EightDxApiError",
      status: 400,
      responseBody: '{"message":"bad request"}'
    } satisfies Partial<EightDxApiError>);
  });
});
