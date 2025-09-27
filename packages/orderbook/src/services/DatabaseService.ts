import { Database } from 'sqlite3';import { Database } from 'sqlite3';

import { Order, Bid, OrderFilters } from '../types';import { promisify } from 'util';

import { Logger } from '../utils/Logger';import { Order, Bid, OrderFilters } from '../types';

import { Logger } from '../utils/Logger';

export class DatabaseService {

  private db: Database | null = null;interface DatabaseRow {

  private logger = new Logger('DatabaseService');  [key: string]: any;

}

  async initialize(): Promise<void> {

    return new Promise((resolve, reject) => {export class DatabaseService {

      this.db = new Database(':memory:', (err) => {  private db: Database | null = null;

        if (err) {  private logger = new Logger('DatabaseService');

          this.logger.error('Failed to initialize database:', err);

          reject(err);  async initialize(): Promise<void> {

          return;    return new Promise((resolve, reject) => {

        }      this.db = new Database(':memory:', (err) => {

        if (err) {

        this.logger.info('Database initialized successfully');          this.logger.error('Failed to initialize database:', err);

        this.createTables().then(resolve).catch(reject);          reject(err);

      });          return;

    });        }

  }

        this.logger.info('Database initialized successfully');

  private async createTables(): Promise<void> {        this.createTables().then(resolve).catch(reject);

    if (!this.db) throw new Error('Database not initialized');      });

    });

    return new Promise((resolve, reject) => {  }

      // Orders table

      this.db!.run(`  private async createTables(): Promise<void> {

        CREATE TABLE IF NOT EXISTS orders (    if (!this.db) throw new Error('Database not initialized');

          orderId TEXT PRIMARY KEY,

          requester TEXT NOT NULL,    const runAsync = promisify(this.db.run.bind(this.db));

          requesterDestAddr TEXT NOT NULL,

          chainFrom TEXT NOT NULL,    // Orders table

          chainTo TEXT NOT NULL,    await runAsync(`

          tokenFrom TEXT NOT NULL,      CREATE TABLE IF NOT EXISTS orders (

          tokenTo TEXT NOT NULL,        orderId TEXT PRIMARY KEY,

          amountFrom TEXT NOT NULL,        requester TEXT NOT NULL,

          minAmountTo TEXT NOT NULL,        requesterDestAddr TEXT NOT NULL,

          expiry INTEGER NOT NULL,        chainFrom TEXT NOT NULL,

          nonce INTEGER NOT NULL,        chainTo TEXT NOT NULL,

          signature TEXT NOT NULL,        tokenFrom TEXT NOT NULL,

          signatureType TEXT NOT NULL,        tokenTo TEXT NOT NULL,

          status TEXT NOT NULL DEFAULT 'open',        amountFrom TEXT NOT NULL,

          createdAt INTEGER NOT NULL,        minAmountTo TEXT NOT NULL,

          updatedAt INTEGER NOT NULL        expiry INTEGER NOT NULL,

        )        nonce INTEGER NOT NULL,

      `, (err) => {        signature TEXT NOT NULL,

        if (err) {        signatureType TEXT NOT NULL,

          this.logger.error('Failed to create orders table:', err);        status TEXT NOT NULL DEFAULT 'open',

          reject(err);        createdAt INTEGER NOT NULL,

          return;        updatedAt INTEGER NOT NULL

        }      )

    `);

        // Bids table

        this.db!.run(`    // Bids table

          CREATE TABLE IF NOT EXISTS bids (    await runAsync(`

            bidId TEXT PRIMARY KEY,      CREATE TABLE IF NOT EXISTS bids (

            orderId TEXT NOT NULL,        bidId TEXT PRIMARY KEY,

            resolver TEXT NOT NULL,        orderId TEXT NOT NULL,

            bidAmount TEXT NOT NULL,        resolver TEXT NOT NULL,

            gasPrice TEXT NOT NULL,        bidAmount TEXT NOT NULL,

            executionTime INTEGER NOT NULL,        executionTime INTEGER NOT NULL,

            collateral TEXT NOT NULL,        reputation INTEGER NOT NULL,

            reputation INTEGER NOT NULL,        timestamp INTEGER NOT NULL,

            timestamp INTEGER NOT NULL,        status TEXT NOT NULL DEFAULT 'active',

            status TEXT NOT NULL DEFAULT 'pending',        FOREIGN KEY (orderId) REFERENCES orders (orderId)

            FOREIGN KEY (orderId) REFERENCES orders (orderId)      )

          )    `);

        `, (err) => {

          if (err) {    // Resolvers table

            this.logger.error('Failed to create bids table:', err);    await runAsync(`

            reject(err);      CREATE TABLE IF NOT EXISTS resolvers (

          } else {        address TEXT PRIMARY KEY,

            this.logger.info('Database tables created successfully');        reputation INTEGER DEFAULT 100,

            resolve();        totalResolved INTEGER DEFAULT 0,

          }        successRate REAL DEFAULT 100.0,

        });        avgExecutionTime INTEGER DEFAULT 0,

      });        isActive INTEGER DEFAULT 1,

    });        createdAt INTEGER NOT NULL,

  }        updatedAt INTEGER NOT NULL

      )

  async saveOrder(order: Order): Promise<void> {    `);

    if (!this.db) throw new Error('Database not initialized');

    this.logger.info('Database tables created successfully');

    return new Promise((resolve, reject) => {  }

      this.db!.run(`

        INSERT OR REPLACE INTO orders (  async saveOrder(order: Order): Promise<void> {

          orderId, requester, requesterDestAddr, chainFrom, chainTo,    if (!this.db) throw new Error('Database not initialized');

          tokenFrom, tokenTo, amountFrom, minAmountTo, expiry,

          nonce, signature, signatureType, status, createdAt, updatedAt    return new Promise((resolve, reject) => {

        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)      this.db!.run(`

      `, [        INSERT OR REPLACE INTO orders (

        order.orderId, order.requester, order.requesterDestAddr,          orderId, requester, requesterDestAddr, chainFrom, chainTo,

        order.chainFrom, order.chainTo, order.tokenFrom, order.tokenTo,          tokenFrom, tokenTo, amountFrom, minAmountTo, expiry,

        order.amountFrom, order.minAmountTo, order.expiry, order.nonce,          nonce, signature, signatureType, status, createdAt, updatedAt

        order.signature, order.signatureType, order.status,        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        order.createdAt, order.updatedAt      `, [

      ], (err) => {        order.orderId, order.requester, order.requesterDestAddr,

        if (err) {        order.chainFrom, order.chainTo, order.tokenFrom, order.tokenTo,

          this.logger.error(`Failed to save order ${order.orderId}:`, err);        order.amountFrom, order.minAmountTo, order.expiry, order.nonce,

          reject(err);        order.signature, order.signatureType, order.status,

        } else {        order.createdAt, order.updatedAt

          this.logger.debug(`Order ${order.orderId} saved to database`);      ], (err) => {

          resolve();        if (err) {

        }          this.logger.error(`Failed to save order ${order.orderId}:`, err);

      });          reject(err);

    });        } else {

  }          this.logger.debug(`Order ${order.orderId} saved to database`);

          resolve();

  async getOrder(orderId: string): Promise<Order | null> {        }

    if (!this.db) throw new Error('Database not initialized');      });

    });

    return new Promise((resolve, reject) => {  }

      this.db!.get('SELECT * FROM orders WHERE orderId = ?', [orderId], (err, row: any) => {

        if (err) {  async getOrder(orderId: string): Promise<Order | null> {

          this.logger.error(`Failed to get order ${orderId}:`, err);    if (!this.db) throw new Error('Database not initialized');

          reject(err);

        } else if (!row) {    const getAsync = promisify(this.db.get.bind(this.db));

          resolve(null);    const row = await getAsync('SELECT * FROM orders WHERE orderId = ?', [orderId]) as DatabaseRow | undefined;

        } else {

          resolve(this.mapRowToOrder(row));    if (!row) return null;

        }

      });    return this.mapRowToOrder(row);

    });  }

  }

  async getOrders(filters: OrderFilters = {}): Promise<Order[]> {

  async getOrders(filters: Partial<OrderFilters> = {}): Promise<Order[]> {    if (!this.db) throw new Error('Database not initialized');

    if (!this.db) throw new Error('Database not initialized');

    const allAsync = promisify(this.db.all.bind(this.db));

    return new Promise((resolve, reject) => {

      let query = 'SELECT * FROM orders';    let query = 'SELECT * FROM orders';

      const params: any[] = [];    const params: any[] = [];

      const conditions: string[] = [];    const conditions: string[] = [];



      if (filters.status) {    if (filters.status) {

        conditions.push('status = ?');      conditions.push('status = ?');

        params.push(filters.status);      params.push(filters.status);

      }    }



      if (filters.chainFrom) {    if (filters.requester) {

        conditions.push('chainFrom = ?');      conditions.push('requester = ?');

        params.push(filters.chainFrom);      params.push(filters.requester);

      }    }



      if (filters.chainTo) {    if (filters.resolver) {

        conditions.push('chainTo = ?');      conditions.push('resolver = ?');

        params.push(filters.chainTo);      params.push(filters.resolver);

      }    }



      if (conditions.length > 0) {    if (conditions.length > 0) {

        query += ' WHERE ' + conditions.join(' AND ');      query += ' WHERE ' + conditions.join(' AND ');

      }    }



      query += ' ORDER BY createdAt DESC';    query += ' ORDER BY createdAt DESC';



      if (filters.limit) {    if (filters.limit) {

        query += ' LIMIT ?';      query += ' LIMIT ?';

        params.push(filters.limit);      params.push(filters.limit);

      }    }



      this.db!.all(query, params, (err, rows: any[]) => {    const rows = await allAsync(query, params) as DatabaseRow[];

        if (err) {    return rows.map(row => this.mapRowToOrder(row));

          this.logger.error('Failed to get orders:', err);  }

          reject(err);

        } else {  async updateOrderStatus(orderId: string, status: string): Promise<void> {

          resolve(rows.map(row => this.mapRowToOrder(row)));    if (!this.db) throw new Error('Database not initialized');

        }

      });    const runAsync = promisify(this.db.run.bind(this.db));

    });

  }    await runAsync(`

      UPDATE orders SET status = ?, updatedAt = ? WHERE orderId = ?

  async updateOrderStatus(orderId: string, status: string): Promise<void> {    `, [status, Date.now(), orderId]);

    if (!this.db) throw new Error('Database not initialized');

    this.logger.debug(`Order ${orderId} status updated to ${status}`);

    return new Promise((resolve, reject) => {  }

      this.db!.run(

        'UPDATE orders SET status = ?, updatedAt = ? WHERE orderId = ?',  async saveBid(bid: Bid): Promise<void> {

        [status, Date.now(), orderId],    if (!this.db) throw new Error('Database not initialized');

        (err) => {

          if (err) {    const runAsync = promisify(this.db.run.bind(this.db));

            this.logger.error(`Failed to update order ${orderId}:`, err);

            reject(err);    await runAsync(`

          } else {      INSERT OR REPLACE INTO bids (

            this.logger.debug(`Order ${orderId} status updated to ${status}`);        bidId, orderId, resolver, bidAmount, executionTime,

            resolve();        reputation, timestamp, status

          }      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        }    `, [

      );      bid.bidId, bid.orderId, bid.resolver, bid.bidAmount,

    });      bid.executionTime, bid.reputation, bid.timestamp, bid.status

  }    ]);



  async saveBid(bid: Bid): Promise<void> {    this.logger.debug(`Bid ${bid.bidId} saved to database`);

    if (!this.db) throw new Error('Database not initialized');  }



    return new Promise((resolve, reject) => {  async getBidsForOrder(orderId: string): Promise<Bid[]> {

      this.db!.run(`    if (!this.db) throw new Error('Database not initialized');

        INSERT OR REPLACE INTO bids (

          bidId, orderId, resolver, bidAmount, gasPrice, executionTime,    const allAsync = promisify(this.db.all.bind(this.db));

          collateral, reputation, timestamp, status    const rows = await allAsync(

        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)      'SELECT * FROM bids WHERE orderId = ? ORDER BY bidAmount ASC',

      `, [      [orderId]

        bid.bidId, bid.orderId, bid.resolver, bid.bidAmount, bid.gasPrice,    ) as DatabaseRow[];

        bid.executionTime, bid.collateral, bid.reputation, bid.timestamp, bid.status

      ], (err) => {    return rows.map(row => this.mapRowToBid(row));

        if (err) {  }

          this.logger.error(`Failed to save bid ${bid.bidId}:`, err);

          reject(err);  async updateBidStatus(bidId: string, status: string): Promise<void> {

        } else {    if (!this.db) throw new Error('Database not initialized');

          this.logger.debug(`Bid ${bid.bidId} saved to database`);

          resolve();    const runAsync = promisify(this.db.run.bind(this.db));

        }

      });    await runAsync(`

    });      UPDATE bids SET status = ? WHERE bidId = ?

  }    `, [status, bidId]);



  async getBidsForOrder(orderId: string): Promise<Bid[]> {    this.logger.debug(`Bid ${bidId} status updated to ${status}`);

    if (!this.db) throw new Error('Database not initialized');  }



    return new Promise((resolve, reject) => {  async getStats(): Promise<any> {

      this.db!.all(    if (!this.db) throw new Error('Database not initialized');

        'SELECT * FROM bids WHERE orderId = ? ORDER BY bidAmount ASC',

        [orderId],    const getAsync = promisify(this.db.get.bind(this.db));

        (err, rows: any[]) => {    const allAsync = promisify(this.db.all.bind(this.db));

          if (err) {

            this.logger.error(`Failed to get bids for order ${orderId}:`, err);    const totalOrders = await getAsync('SELECT COUNT(*) as count FROM orders') as DatabaseRow;

            reject(err);    const activeOrders = await getAsync('SELECT COUNT(*) as count FROM orders WHERE status = "pending"') as DatabaseRow;

          } else {    const completedOrders = await getAsync('SELECT COUNT(*) as count FROM orders WHERE status = "completed"') as DatabaseRow;

            resolve(rows.map(row => this.mapRowToBid(row)));

          }    const topResolvers = await allAsync(`

        }      SELECT resolver, COUNT(*) as resolved_count 

      );      FROM orders 

    });      WHERE status = 'completed' AND resolver IS NOT NULL 

  }      GROUP BY resolver 

      ORDER BY resolved_count DESC 

  async updateBidStatus(bidId: string, status: string): Promise<void> {      LIMIT 10

    if (!this.db) throw new Error('Database not initialized');    `) as DatabaseRow[];



    return new Promise((resolve, reject) => {    return {

      this.db!.run(      totalOrders: totalOrders.count,

        'UPDATE bids SET status = ? WHERE bidId = ?',      activeOrders: activeOrders.count,

        [status, bidId],      completedOrders: completedOrders.count,

        (err) => {      avgOrderValue: 0, // TODO: Calculate based on actual values

          if (err) {      topResolvers: topResolvers.map((r: DatabaseRow) => ({

            this.logger.error(`Failed to update bid ${bidId}:`, err);        address: r.resolver,

            reject(err);        resolvedCount: r.resolved_count

          } else {      }))

            this.logger.debug(`Bid ${bidId} status updated to ${status}`);    };

            resolve();  }

          }

        }  private mapRowToOrder(row: DatabaseRow): Order {

      );    return {

    });      orderId: row.orderId,

  }      requester: row.requester,

      requesterDestAddr: row.requesterDestAddr,

  async getStats(): Promise<any> {      inputToken: row.inputToken,

    if (!this.db) throw new Error('Database not initialized');      inputAmount: row.inputAmount,

      outputToken: row.outputToken,

    return new Promise((resolve, reject) => {      outputAmount: row.outputAmount,

      // Simple stats for now      deadline: row.deadline,

      this.db!.get('SELECT COUNT(*) as count FROM orders', [], (err, totalOrders: any) => {      status: row.status,

        if (err) {      resolver: row.resolver,

          reject(err);      resolverFee: row.resolverFee,

          return;      createdAt: row.createdAt,

        }      updatedAt: row.updatedAt

    };

        this.db!.get('SELECT COUNT(*) as count FROM orders WHERE status = "open"', [], (err, activeOrders: any) => {  }

          if (err) {

            reject(err);  private mapRowToBid(row: DatabaseRow): Bid {

            return;    return {

          }      bidId: row.bidId,

      orderId: row.orderId,

          resolve({      resolver: row.resolver,

            totalOrders: totalOrders.count,      bidAmount: row.bidAmount,

            activeOrders: activeOrders.count,      executionTime: row.executionTime,

            completedOrders: 0,      reputation: row.reputation,

            avgOrderValue: 0,      timestamp: row.timestamp,

            topResolvers: []      status: row.status

          });    };

        });  }

      });

    });  async close(): Promise<void> {

  }    return new Promise((resolve) => {

      if (this.db) {

  private mapRowToOrder(row: any): Order {        this.db.close((err) => {

    return {          if (err) {

      orderId: row.orderId,            this.logger.error('Error closing database:', err);

      requester: row.requester,          } else {

      requesterDestAddr: row.requesterDestAddr,            this.logger.info('Database connection closed');

      chainFrom: row.chainFrom,          }

      chainTo: row.chainTo,          resolve();

      tokenFrom: row.tokenFrom,        });

      tokenTo: row.tokenTo,      } else {

      amountFrom: row.amountFrom,        resolve();

      minAmountTo: row.minAmountTo,      }

      expiry: row.expiry,    });

      nonce: row.nonce,  }

      signature: row.signature,}
      signatureType: row.signatureType,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private mapRowToBid(row: any): Bid {
    return {
      bidId: row.bidId,
      orderId: row.orderId,
      resolver: row.resolver,
      bidAmount: row.bidAmount,
      gasPrice: row.gasPrice,
      executionTime: row.executionTime,
      collateral: row.collateral,
      reputation: row.reputation,
      timestamp: row.timestamp,
      status: row.status
    };
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            this.logger.error('Error closing database:', err);
          } else {
            this.logger.info('Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}