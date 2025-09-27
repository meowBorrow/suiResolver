import { v4 as uuidv4 } from 'uuid';
import { Bid, AuctionResult } from '../types';
import { DatabaseService } from './DatabaseService';
import { Logger } from '../utils/Logger';

export class BidService {
  private logger = new Logger('BidService');
  private auctionDuration = 60000; // 60 seconds

  constructor(private databaseService: DatabaseService) {}

  async createBid(bidData: any): Promise<Bid> {
    const bid: Bid = {
      bidId: bidData.bidId || uuidv4(),
      orderId: bidData.orderId,
      resolver: bidData.resolver,
      bidAmount: bidData.bidAmount,
      gasPrice: bidData.gasPrice || '0',
      executionTime: bidData.executionTime || 120,
      collateral: bidData.collateral || '0',
      reputation: bidData.reputation || 0,
      timestamp: Date.now(),
      status: 'pending'
    };

    await this.databaseService.createBid(bid);
    this.logger.info(`Bid created: ${bid.bidId} for order ${bid.orderId}`);
    
    return bid;
  }

  async getBidsForOrder(orderId: string): Promise<Bid[]> {
    return await this.databaseService.getBidsForOrder(orderId);
  }

  async processAuction(orderId: string): Promise<AuctionResult> {
    const order = await this.databaseService.getOrder(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const bids = await this.getBidsForOrder(orderId);
    const now = Date.now();
    const auctionEndTime = order.createdAt + this.auctionDuration;

    // Check if auction period has ended
    if (now < auctionEndTime) {
      return {
        orderId,
        allBids: bids,
        endTime: auctionEndTime
      };
    }

    // Find the best bid based on multiple criteria
    const validBids = bids.filter(bid => bid.status === 'pending');
    if (validBids.length === 0) {
      return {
        orderId,
        allBids: bids,
        endTime: auctionEndTime
      };
    }

    // Score bids based on multiple factors
    const scoredBids = validBids.map(bid => ({
      bid,
      score: this.calculateBidScore(bid, order.minAmountTo)
    }));

    // Sort by score (higher is better)
    scoredBids.sort((a, b) => b.score - a.score);
    const winningBid = scoredBids[0].bid;

    // Update bid statuses
    for (const bid of validBids) {
      const newStatus = bid.bidId === winningBid.bidId ? 'won' : 'lost';
      await this.databaseService.updateBidStatus(bid.bidId, newStatus);
    }

    // Update order status
    await this.databaseService.updateOrderStatus(orderId, 'matched');

    this.logger.info(`Auction completed for order ${orderId}, winner: ${winningBid.resolver}`);

    return {
      orderId,
      winner: { ...winningBid, status: 'won' },
      allBids: bids,
      endTime: auctionEndTime
    };
  }

  private calculateBidScore(bid: Bid, minAmountTo: string): number {
    const bidAmount = BigInt(bid.bidAmount);
    const minAmount = BigInt(minAmountTo);
    
    // Score factors (normalized to 0-1 range)
    const amountScore = bidAmount >= minAmount ? 
      Math.min(Number(bidAmount - minAmount) / Number(minAmount), 1) : -1;
    
    const reputationScore = bid.reputation / 1000; // Max reputation is 1000
    const timeScore = Math.max(0, 1 - (bid.executionTime / 300)); // Prefer faster execution (max 5 min)
    
    // Weighted combination (amount most important, then reputation, then speed)
    return (amountScore * 0.6) + (reputationScore * 0.3) + (timeScore * 0.1);
  }
}