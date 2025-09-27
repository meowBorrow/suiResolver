import { v4 as uuidv4 } from 'uuid';
import { Order, OrderFilters, MarketStats } from '../types';
import { DatabaseService } from './DatabaseService';
import { Logger } from '../utils/Logger';

export class OrderService {
  private logger = new Logger('OrderService');

  constructor(private databaseService: DatabaseService) {}

  async createOrder(orderData: any): Promise<Order> {
    const now = Date.now();
    
    const order: Order = {
      orderId: orderData.orderId || uuidv4(),
      requester: orderData.requester,
      requesterDestAddr: orderData.requesterDestAddr,
      chainFrom: orderData.chainFrom,
      chainTo: orderData.chainTo,
      tokenFrom: orderData.tokenFrom,
      tokenTo: orderData.tokenTo,
      amountFrom: orderData.amountFrom,
      minAmountTo: orderData.minAmountTo,
      expiry: orderData.expiry,
      nonce: orderData.nonce,
      signature: orderData.signature,
      signatureType: orderData.signatureType,
      status: 'open',
      createdAt: now,
      updatedAt: now
    };

    await this.databaseService.createOrder(order);
    this.logger.info(`Order created: ${order.orderId}`);
    
    return order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return await this.databaseService.getOrder(orderId);
  }

  async getOrders(filters: OrderFilters): Promise<Order[]> {
    return await this.databaseService.getOrders(filters);
  }

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    await this.databaseService.updateOrderStatus(orderId, status);
    this.logger.info(`Order ${orderId} status updated to: ${status}`);
  }

  async getMarketStats(): Promise<MarketStats> {
    return await this.databaseService.getMarketStats();
  }

  // Check for expired orders and update their status
  async processExpiredOrders(): Promise<void> {
    const now = Date.now();
    const activeOrders = await this.getOrders({
      status: 'open',
      page: 1,
      limit: 1000
    });

    for (const order of activeOrders) {
      if (order.expiry < now) {
        await this.updateOrderStatus(order.orderId, 'expired');
        this.logger.info(`Order ${order.orderId} expired`);
      }
    }
  }
}