import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from 'dotenv';
import { OrderService } from './services/OrderService';
import { BidService } from './services/BidService';
import { DatabaseService } from './services/DatabaseService';
import { WebSocketService } from './services/WebSocketService';
import { ValidationService } from './services/ValidationService';
import { Logger } from './utils/Logger';

// Load environment variables
config();

const logger = new Logger('OrderbookServer');
const app = express();
const port = process.env.ORDERBOOK_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const databaseService = new DatabaseService();
const orderService = new OrderService(databaseService);
const bidService = new BidService(databaseService);
const validationService = new ValidationService();
const wsService = new WebSocketService();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'orderbook'
  });
});

// Order endpoints
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate order data
    const validation = await validationService.validateOrder(orderData);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid order data', 
        details: validation.errors 
      });
    }

    // Create order
    const order = await orderService.createOrder(orderData);
    
    // Broadcast new order to WebSocket clients
    wsService.broadcast('new_order', order);
    
    logger.info(`New order created: ${order.orderId}`);
    res.status(201).json(order);
  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { status, chainFrom, chainTo, page = 1, limit = 50 } = req.query;
    
    const filters = {
      status: status as string,
      chainFrom: chainFrom as string,
      chainTo: chainTo as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    };

    const orders = await orderService.getOrders(filters);
    res.json(orders);
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    logger.error('Error fetching order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bid endpoints
app.post('/api/bids', async (req, res) => {
  try {
    const bidData = req.body;
    
    // Validate bid data
    const validation = await validationService.validateBid(bidData);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid bid data', 
        details: validation.errors 
      });
    }

    // Create bid
    const bid = await bidService.createBid(bidData);
    
    // Check if this bid wins the auction
    const auctionResult = await bidService.processAuction(bidData.orderId);
    
    // Broadcast bid and potential auction result
    wsService.broadcast('new_bid', bid);
    if (auctionResult.winner) {
      wsService.broadcast('auction_won', auctionResult);
      logger.info(`Auction won for order ${bidData.orderId} by ${auctionResult.winner.resolver}`);
    }
    
    res.status(201).json(bid);
  } catch (error) {
    logger.error('Error creating bid:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bids/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const bids = await bidService.getBidsForOrder(orderId);
    res.json(bids);
  } catch (error) {
    logger.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Market data endpoints
app.get('/api/market/stats', async (req, res) => {
  try {
    const stats = await orderService.getMarketStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching market stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start HTTP server
const server = app.listen(port, () => {
  logger.info(`Orderbook service listening on port ${port}`);
});

// Start WebSocket server
const wss = new WebSocketServer({ server });
wsService.initialize(wss);

// Initialize database
databaseService.initialize().then(() => {
  logger.info('Database initialized successfully');
}).catch((error) => {
  logger.error('Failed to initialize database:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    databaseService.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  server.close(() => {
    databaseService.close();
    process.exit(0);
  });
});