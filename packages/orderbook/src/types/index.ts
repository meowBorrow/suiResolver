export interface Order {
  orderId: string;
  requester: string;
  requesterDestAddr: string;
  chainFrom: 'ethereum' | 'sui';
  chainTo: 'ethereum' | 'sui';
  tokenFrom: string;
  tokenTo: string;
  amountFrom: string;
  minAmountTo: string;
  expiry: number;
  nonce: number;
  signature: string;
  signatureType: 'eip712' | 'sui';
  status: 'open' | 'matched' | 'executed' | 'expired' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface Bid {
  bidId: string;
  orderId: string;
  resolver: string;
  bidAmount: string;
  gasPrice: string;
  executionTime: number; // seconds
  collateral: string;
  reputation: number;
  timestamp: number;
  status: 'pending' | 'won' | 'lost' | 'expired';
}

export interface AuctionResult {
  orderId: string;
  winner?: Bid;
  allBids: Bid[];
  endTime: number;
}

export interface MarketStats {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  totalVolume: {
    ethereum: string;
    sui: string;
  };
  averageExecutionTime: number;
  topResolvers: Array<{
    address: string;
    successRate: number;
    totalSwaps: number;
  }>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface OrderFilters {
  status?: string;
  chainFrom?: string;
  chainTo?: string;
  page: number;
  limit: number;
}

export type ChainType = 'ethereum' | 'sui';
export type OrderStatus = 'open' | 'matched' | 'executed' | 'expired' | 'cancelled';
export type BidStatus = 'pending' | 'won' | 'lost' | 'expired';