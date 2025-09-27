import { ethers } from 'ethers';
import WebSocket from 'ws';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from './utils/Logger';

export interface ResolverConfig {
  orderbookUrl: string;
  orderbookWsUrl: string;
  ethereumRpcUrl: string;
  ethereumPrivateKey: string;
  escrowAddress: string;
  stakingAddress: string;
  minStakeAmount?: string;
  minReputationScore?: number;
  maxSlippage?: number;
}

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
  executionTime: number;
  collateral: string;
  reputation: number;
  timestamp: number;
  status: 'pending' | 'won' | 'lost' | 'expired';
}

export class ResolverService {
  private logger = new Logger('ResolverService');
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private escrowContract: ethers.Contract;
  private stakingContract: ethers.Contract;
  private ws: WebSocket | null = null;
  private isRunning = false;
  private orderbook: Map<string, Order> = new Map();
  private myBids: Map<string, Bid> = new Map();
  
  private readonly ESCROW_ABI = [
    'function executeOrder(bytes32 orderId, address resolver) external payable',
    'function verifyOrderSignature(bytes32 orderId, address requester, address requesterDestAddr, uint256 chainFrom, uint256 chainTo, address tokenFrom, address tokenTo, uint256 amountFrom, uint256 minAmountTo, uint256 expiry, uint256 nonce, bytes signature) external view returns (bool)',
    'function orders(bytes32) external view returns (address requester, address requesterDestAddr, uint256 chainFrom, uint256 chainTo, address tokenFrom, address tokenTo, uint256 amountFrom, uint256 minAmountTo, uint256 expiry, uint256 nonce, uint8 status)',
    'event OrderCreated(bytes32 indexed orderId, address indexed requester)',
    'event OrderExecuted(bytes32 indexed orderId, address indexed resolver)'
  ];

  private readonly STAKING_ABI = [
    'function stake() external payable',
    'function unstake(uint256 amount) external',
    'function getStake(address resolver) external view returns (uint256)',
    'function getReputation(address resolver) external view returns (uint256)',
    'function isResolver(address resolver) external view returns (bool)'
  ];

  constructor(private config: ResolverConfig) {
    this.provider = new ethers.JsonRpcProvider(config.ethereumRpcUrl);
    this.wallet = new ethers.Wallet(config.ethereumPrivateKey, this.provider);
    
    this.escrowContract = new ethers.Contract(
      config.escrowAddress,
      this.ESCROW_ABI,
      this.wallet
    );
    
    this.stakingContract = new ethers.Contract(
      config.stakingAddress,
      this.STAKING_ABI,
      this.wallet
    );
  }

  async start(): Promise<void> {
    this.logger.info('Starting resolver service...');
    
    try {
      // Check if we're already staked
      await this.ensureStaked();
      
      // Start WebSocket connection to orderbook
      await this.connectToOrderbook();
      
      // Start periodic tasks
      this.startPeriodicTasks();
      
      this.isRunning = true;
      this.logger.info('Resolver service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start resolver service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping resolver service...');
    this.isRunning = false;
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.logger.info('Resolver service stopped');
  }

  private async ensureStaked(): Promise<void> {
    try {
      const currentStake = await this.stakingContract.getStake(this.wallet.address);
      const minStake = ethers.parseEther(this.config.minStakeAmount || '1.0');
      
      if (currentStake < minStake) {
        this.logger.info(`Current stake ${ethers.formatEther(currentStake)} ETH below minimum ${ethers.formatEther(minStake)} ETH, staking...`);
        
        const stakeAmount = minStake - currentStake;
        const tx = await this.stakingContract.stake({ value: stakeAmount });
        await tx.wait();
        
        this.logger.info(`Staked ${ethers.formatEther(stakeAmount)} ETH`);
      } else {
        this.logger.info(`Already staked ${ethers.formatEther(currentStake)} ETH`);
      }
      
    } catch (error) {
      this.logger.error('Failed to ensure staking:', error);
      throw error;
    }
  }

  private async connectToOrderbook(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.orderbookWsUrl);
      
      this.ws.on('open', () => {
        this.logger.info('Connected to orderbook WebSocket');
        
        // Subscribe to order updates
        this.ws!.send(JSON.stringify({
          type: 'subscribe',
          channel: 'orders'
        }));
        
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleOrderbookMessage(message);
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        this.logger.warn('WebSocket connection closed, attempting to reconnect...');
        if (this.isRunning) {
          setTimeout(() => this.connectToOrderbook(), 5000);
        }
      });
    });
  }

  private handleOrderbookMessage(message: any): void {
    switch (message.type) {
      case 'new_order':
        this.handleNewOrder(message.data);
        break;
      case 'order_update':
        this.handleOrderUpdate(message.data);
        break;
      case 'auction_result':
        this.handleAuctionResult(message.data);
        break;
      default:
        this.logger.debug('Unknown message type:', message.type);
    }
  }

  private async handleNewOrder(order: Order): Promise<void> {
    this.logger.info(`New order received: ${order.orderId}`);
    this.orderbook.set(order.orderId, order);
    
    // Evaluate if we want to bid on this order
    const shouldBid = await this.evaluateOrder(order);
    if (shouldBid) {
      await this.submitBid(order);
    }
  }

  private handleOrderUpdate(order: Order): void {
    this.orderbook.set(order.orderId, order);
    this.logger.debug(`Order updated: ${order.orderId}, status: ${order.status}`);
  }

  private handleAuctionResult(result: any): void {
    const { orderId, winner } = result;
    
    if (winner && winner.resolver === this.wallet.address) {
      this.logger.info(`Won auction for order ${orderId}!`);
      this.executeOrder(orderId);
    } else {
      this.logger.debug(`Lost auction for order ${orderId}`);
      // Remove our bid from tracking
      this.myBids.delete(orderId);
    }
  }

  private async evaluateOrder(order: Order): Promise<boolean> {
    try {
      // Basic filtering criteria
      if (order.status !== 'open') {
        return false;
      }
      
      // Check if order is expired
      if (Date.now() / 1000 > order.expiry) {
        return false;
      }
      
      // For now, only handle Ethereum -> Ethereum orders in demo
      if (order.chainFrom !== 'ethereum' || order.chainTo !== 'ethereum') {
        this.logger.debug(`Skipping cross-chain order ${order.orderId} (not implemented yet)`);
        return false;
      }
      
      // Check if we have sufficient liquidity
      // This would involve checking our token balances
      // For demo, assume we can handle it
      
      this.logger.info(`Order ${order.orderId} passes evaluation criteria`);
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to evaluate order ${order.orderId}:`, error);
      return false;
    }
  }

  private async submitBid(order: Order): Promise<void> {
    try {
      // Calculate our bid (for demo, just use a competitive rate)
      const estimatedGas = 150000n; // Estimated gas for execution
      const gasPrice = (await this.provider.getFeeData()).gasPrice || 20000000000n;
      const executionCost = estimatedGas * gasPrice;
      
      // Add small profit margin (1%)
      const profit = BigInt(order.amountFrom) * 1n / 100n;
      const bidAmount = executionCost + profit;
      
      const bid: Omit<Bid, 'bidId'> = {
        orderId: order.orderId,
        resolver: this.wallet.address,
        bidAmount: bidAmount.toString(),
        gasPrice: gasPrice.toString(),
        executionTime: 30, // 30 seconds estimated
        collateral: ethers.parseEther('0.1').toString(), // 0.1 ETH collateral
        reputation: 100, // Would come from on-chain reputation
        timestamp: Date.now(),
        status: 'pending'
      };
      
      // Submit bid to orderbook
      const response = await axios.post(`${this.config.orderbookUrl}/api/orders/${order.orderId}/bids`, bid);
      
      if (response.status === 200) {
        const bidWithId = { ...bid, bidId: response.data.bidId };
        this.myBids.set(order.orderId, bidWithId);
        this.logger.info(`Submitted bid for order ${order.orderId}: ${ethers.formatEther(bidAmount)} ETH`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to submit bid for order ${order.orderId}:`, error);
    }
  }

  private async executeOrder(orderId: string): Promise<void> {
    try {
      this.logger.info(`Executing order ${orderId}...`);
      
      const order = this.orderbook.get(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found in local orderbook`);
      }
      
      // Convert orderId to bytes32
      const orderIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(orderId));
      
      // Execute the order on-chain
      const tx = await this.escrowContract.executeOrder(
        orderIdBytes32,
        this.wallet.address,
        { 
          value: order.amountFrom, // Send the required amount
          gasLimit: 200000 // Conservative gas limit
        }
      );
      
      this.logger.info(`Execution transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      this.logger.info(`Order ${orderId} executed successfully in block ${receipt.blockNumber}`);
      
      // Remove from our tracking
      this.myBids.delete(orderId);
      
    } catch (error) {
      this.logger.error(`Failed to execute order ${orderId}:`, error);
    }
  }

  private startPeriodicTasks(): void {
    // Check for expired orders every minute
    setInterval(() => {
      if (this.isRunning) {
        this.cleanupExpiredOrders();
      }
    }, 60000);
    
    // Sync orderbook every 30 seconds
    setInterval(() => {
      if (this.isRunning) {
        this.syncOrderbook();
      }
    }, 30000);
  }

  private cleanupExpiredOrders(): void {
    const now = Date.now() / 1000;
    for (const [orderId, order] of this.orderbook.entries()) {
      if (order.expiry < now) {
        this.orderbook.delete(orderId);
        this.myBids.delete(orderId);
        this.logger.debug(`Cleaned up expired order ${orderId}`);
      }
    }
  }

  private async syncOrderbook(): Promise<void> {
    try {
      const response = await axios.get(`${this.config.orderbookUrl}/api/orders?status=open&limit=100`);
      
      if (response.status === 200) {
        const orders = response.data.orders || [];
        
        // Update local orderbook
        for (const order of orders) {
          this.orderbook.set(order.orderId, order);
        }
        
        this.logger.debug(`Synced ${orders.length} open orders from orderbook`);
      }
      
    } catch (error) {
      this.logger.error('Failed to sync orderbook:', error);
    }
  }

  // Public getters for monitoring
  getStatus() {
    return {
      isRunning: this.isRunning,
      connectedToOrderbook: this.ws?.readyState === WebSocket.OPEN,
      trackedOrders: this.orderbook.size,
      activeBids: this.myBids.size,
      walletAddress: this.wallet.address
    };
  }
}