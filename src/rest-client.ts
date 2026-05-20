import type {
  CancelLimitOrderInput,
  EightDxClient,
  EightDxConfig,
  JsonObject,
  LimitOrderByHashInput,
  LimitOrderHistoryInput,
  LimitOrderInput,
  LimitOrdersByMakerInput,
  PermitAddressInput,
  PermitDataInput,
  QuoteInput,
  SwapInput
} from "./types.js";
import { SOURCE_HEADER_VALUE } from "./version.js";

type RequestOptions = {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
};

export class EightDxApiError extends Error {
  readonly responseBody: string;
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, responseBody: string) {
    super(`8DX API request failed with ${status} ${statusText}: ${responseBody}`);
    this.name = "EightDxApiError";
    this.responseBody = responseBody;
    this.status = status;
    this.statusText = statusText;
  }
}

export class EightDxRestClient implements EightDxClient {
  private readonly config: EightDxConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: EightDxConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async getHealth(): Promise<unknown> {
    return this.request({ method: "GET", path: "/api/health" });
  }

  async getQuote(input: QuoteInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/quote`,
      query: {
        addressTokenIn: input.addressTokenIn,
        addressTokenOut: input.addressTokenOut,
        amountIn: input.amountIn,
        amountInWei: input.amountInWei
      }
    });
  }

  async createSwap(input: SwapInput): Promise<unknown> {
    const { blockchain, ...body } = input;
    return this.request({
      body,
      method: "POST",
      path: `/api/${encodeURIComponent(blockchain)}/swap`
    });
  }

  async getPermitAddress(input: PermitAddressInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/permit/address`
    });
  }

  async getPermitData(input: PermitDataInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/permit/data`,
      query: {
        addressTokenIn: input.addressTokenIn,
        dstAddress: input.dstAddress,
        amountIn: input.amountIn
      }
    });
  }

  async createLimitOrder(input: LimitOrderInput): Promise<unknown> {
    const { blockchain, ...body } = input;
    return this.request({
      body,
      method: "POST",
      path: `/api/${encodeURIComponent(blockchain)}/order`
    });
  }

  async getLimitOrdersByMaker(input: LimitOrdersByMakerInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/orders/byMaker/${encodeURIComponent(
        input.maker
      )}`
    });
  }

  async getLimitOrderHistory(input: LimitOrderHistoryInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/orders/byMaker/history/${encodeURIComponent(
        input.maker
      )}`,
      query: {
        limit: input.limit,
        offset: input.offset,
        cursor: input.cursor,
        sort: input.sort
      }
    });
  }

  async getLimitOrderByHash(input: LimitOrderByHashInput): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `/api/${encodeURIComponent(input.blockchain)}/orders/${encodeURIComponent(
        input.orderHash
      )}`
    });
  }

  async cancelLimitOrder(input: CancelLimitOrderInput): Promise<unknown> {
    const { blockchain, ...body } = input;
    return this.request({
      body,
      method: "POST",
      path: `/api/${encodeURIComponent(blockchain)}/orders/cancel`
    });
  }

  private async request(options: RequestOptions): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const init: RequestInit = {
        headers: this.createHeaders(options),
        method: options.method,
        signal: controller.signal
      };

      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      const response = await this.fetchImpl(this.createUrl(options), init);
      const responseBody = await response.text();

      if (!response.ok) {
        throw new EightDxApiError(response.status, response.statusText, responseBody);
      }

      return parseResponseBody(responseBody, response.headers.get("content-type"));
    } finally {
      clearTimeout(timeout);
    }
  }

  private createUrl(options: RequestOptions): string {
    const url = new URL(options.path, this.config.apiBaseUrl);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private createHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Source": SOURCE_HEADER_VALUE,
      accept: "application/json, text/plain;q=0.9",
      "user-agent": "@8dx/8dx-mcp-server"
    };

    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    return headers;
  }
}

function parseResponseBody(responseBody: string, contentType: string | null): unknown {
  if (!responseBody) {
    return null;
  }

  if (contentType?.includes("application/json")) {
    return JSON.parse(responseBody) as JsonObject;
  }

  return responseBody;
}
