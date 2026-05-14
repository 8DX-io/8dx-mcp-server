export type Blockchain = "ethereum";
export type PermitBlockchain = "ethereum" | "bsc";

export type JsonObject = Record<string, unknown>;

export type EightDxConfig = {
  apiBaseUrl: string;
  requestTimeoutMs: number;
};

export type QuoteInput = {
  blockchain: Blockchain;
  addressTokenIn: string;
  addressTokenOut: string;
  amountIn: string;
};

export type SwapInput = {
  blockchain: Blockchain;
  deadline?: number | null | undefined;
  dstAddress: string;
  fromAddress?: string | null | undefined;
  path: JsonObject;
  permit?: JsonObject | null | undefined;
  skipSimulation?: boolean | null | undefined;
  slippageBps?: number | null | undefined;
  usePermit?: boolean | null | undefined;
};

export type PermitAddressInput = {
  blockchain: PermitBlockchain;
};

export type PermitDataInput = {
  blockchain: PermitBlockchain;
  addressTokenIn: string;
  dstAddress: string;
  amountIn: string;
};

export type LimitOrderInput = {
  blockchain: Blockchain;
  maker: string;
  makerSrcOrToken: string;
  orderType: "limit" | "twap";
  params: JsonObject;
  recipient?: string | null | undefined;
  takerSrcOrToken: string;
};

export type LimitOrdersByMakerInput = {
  blockchain: Blockchain;
  maker: string;
};

export type LimitOrderHistoryInput = {
  blockchain: Blockchain;
  maker: string;
  limit: number;
  offset?: number | undefined;
  cursor?: string | undefined;
  sort?: "asc" | "desc" | undefined;
};

export type LimitOrderByHashInput = {
  blockchain: Blockchain;
  orderHash: string;
};

export type CancelLimitOrderInput = {
  blockchain: Blockchain;
  deadline: number;
  maker: string;
  orderHash: string;
  signature: string;
};

export type EightDxClient = {
  cancelLimitOrder(input: CancelLimitOrderInput): Promise<unknown>;
  createLimitOrder(input: LimitOrderInput): Promise<unknown>;
  createSwap(input: SwapInput): Promise<unknown>;
  getHealth(): Promise<unknown>;
  getLimitOrderByHash(input: LimitOrderByHashInput): Promise<unknown>;
  getLimitOrderHistory(input: LimitOrderHistoryInput): Promise<unknown>;
  getLimitOrdersByMaker(input: LimitOrdersByMakerInput): Promise<unknown>;
  getPermitAddress(input: PermitAddressInput): Promise<unknown>;
  getPermitData(input: PermitDataInput): Promise<unknown>;
  getQuote(input: QuoteInput): Promise<unknown>;
};
