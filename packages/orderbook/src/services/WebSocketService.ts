import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '../utils/Logger';

interface WebSocketMessage {
  type: string;
  data: any;
}

interface SubscriptionFilters {
  chainFrom?: string[];
  chainTo?: string[];
  resolver?: string;
}

interface ClientConnection {
  ws: WebSocket;
  subscriptions: {
    orders: boolean;
    bids: boolean;
    auctions: boolean;
  };
  filters?: SubscriptionFilters;
}

export class WebSocketService {
  private clients: Map<string, ClientConnection> = new Map();
  private logger = new Logger('WebSocketService');

  initialize(wss: WebSocketServer): void {
    wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      
      const client: ClientConnection = {
        ws,
        subscriptions: {
          orders: false,
          bids: false,
          auctions: false
        }
      };

      this.clients.set(clientId, client);
      this.logger.info(`Client connected: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          this.logger.error(`Error parsing message from ${clientId}:`, error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.logger.info(`Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for client ${clientId}:`, error);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId,
        timestamp: Date.now()
      }));
    });

    this.logger.info('WebSocket server initialized');
  }

  private handleMessage(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe_orders':
        client.subscriptions.orders = true;
        client.filters = message.data?.filters;
        client.ws.send(JSON.stringify({
          type: 'subscription_confirmed',
          subscription: 'orders',
          filters: client.filters
        }));
        break;

      case 'subscribe_bids':
        client.subscriptions.bids = true;
        client.ws.send(JSON.stringify({
          type: 'subscription_confirmed',
          subscription: 'bids'
        }));
        break;

      case 'subscribe_auctions':
        client.subscriptions.auctions = true;
        client.ws.send(JSON.stringify({
          type: 'subscription_confirmed',
          subscription: 'auctions'
        }));
        break;

      case 'unsubscribe':
        const { subscription } = message.data;
        if (subscription === 'orders') client.subscriptions.orders = false;
        if (subscription === 'bids') client.subscriptions.bids = false;
        if (subscription === 'auctions') client.subscriptions.auctions = false;
        client.ws.send(JSON.stringify({
          type: 'unsubscription_confirmed',
          subscription
        }));
        break;

      case 'ping':
        client.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;

      default:
        client.ws.send(JSON.stringify({
          error: `Unknown message type: ${message.type}`
        }));
    }
  }

  broadcast(eventType: string, data: any): void {
    const message = JSON.stringify({
      event: eventType,
      data,
      timestamp: Date.now()
    });

    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      try {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check subscriptions and filters
          if (this.shouldSendToClient(client, eventType, data)) {
            client.ws.send(message);
            sentCount++;
          }
        }
      } catch (error) {
        this.logger.error(`Error sending message to client ${clientId}:`, error);
      }
    });

    this.logger.debug(`Broadcast ${eventType} to ${sentCount} clients`);
  }

  private shouldSendToClient(client: ClientConnection, eventType: string, data: any): boolean {
    // Check if client is subscribed to this event type
    if (eventType === 'new_order' && !client.subscriptions.orders) return false;
    if (eventType === 'new_bid' && !client.subscriptions.bids) return false;
    if (eventType === 'auction_won' && !client.subscriptions.auctions) return false;

    // Apply filters for orders
    if (eventType === 'new_order' && client.filters) {
      const { chainFrom, chainTo, resolver } = client.filters;
      
      if (chainFrom && chainFrom.length > 0 && !chainFrom.includes(data.chainFrom)) {
        return false;
      }
      
      if (chainTo && chainTo.length > 0 && !chainTo.includes(data.chainTo)) {
        return false;
      }
      
      if (resolver && data.resolver !== resolver) {
        return false;
      }
    }

    return true;
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  getClientStats(): any {
    let orderSubscriptions = 0;
    let bidSubscriptions = 0;
    let auctionSubscriptions = 0;

    this.clients.forEach(client => {
      if (client.subscriptions.orders) orderSubscriptions++;
      if (client.subscriptions.bids) bidSubscriptions++;
      if (client.subscriptions.auctions) auctionSubscriptions++;
    });

    return {
      totalClients: this.clients.size,
      subscriptions: {
        orders: orderSubscriptions,
        bids: bidSubscriptions,
        auctions: auctionSubscriptions
      }
    };
  }
}