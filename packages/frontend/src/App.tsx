import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

interface Order {
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
  status: string;
  createdAt: number;
}

const ORDERBOOK_API = 'http://localhost:3000/api';
const ESCROW_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

function App() {
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  
  // Form state for creating orders
  const [tokenFrom, setTokenFrom] = useState('ETH');
  const [tokenTo, setTokenTo] = useState('ETH');
  const [amountFrom, setAmountFrom] = useState('');
  const [minAmountTo, setMinAmountTo] = useState('');
  const [destAddress, setDestAddress] = useState('');

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send('eth_requestAccounts', []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setProvider(provider);
        setAccount(address);
        setConnected(true);
        setDestAddress(address); // Default destination to same address
      } catch (error) {
        console.error('Failed to connect wallet:', error);
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  const loadOrders = async () => {
    try {
      const response = await fetch(`${ORDERBOOK_API}/orders?status=open&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
    }
  };

  const createOrder = async () => {
    if (!connected || !provider) {
      alert('Please connect your wallet first');
      return;
    }

    if (!amountFrom || !minAmountTo || !destAddress) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const order = {
        orderId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requester: address,
        requesterDestAddr: destAddress,
        chainFrom: 'ethereum' as const,
        chainTo: 'ethereum' as const,
        tokenFrom: tokenFrom,
        tokenTo: tokenTo,
        amountFrom: ethers.parseEther(amountFrom).toString(),
        minAmountTo: ethers.parseEther(minAmountTo).toString(),
        expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        nonce: Date.now(),
        signature: '', // Will be generated
        signatureType: 'eip712' as const,
        status: 'open' as const,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Create EIP-712 signature
      const domain = {
        name: 'Fusion+',
        version: '1',
        chainId: 31337, // Anvil local network
        verifyingContract: ESCROW_ADDRESS
      };

      const types = {
        Order: [
          { name: 'orderId', type: 'string' },
          { name: 'requester', type: 'address' },
          { name: 'requesterDestAddr', type: 'address' },
          { name: 'chainFrom', type: 'uint256' },
          { name: 'chainTo', type: 'uint256' },
          { name: 'tokenFrom', type: 'address' },
          { name: 'tokenTo', type: 'address' },
          { name: 'amountFrom', type: 'uint256' },
          { name: 'minAmountTo', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const value = {
        orderId: order.orderId,
        requester: order.requester,
        requesterDestAddr: order.requesterDestAddr,
        chainFrom: 1, // Ethereum
        chainTo: 1,   // Ethereum
        tokenFrom: ethers.ZeroAddress, // ETH
        tokenTo: ethers.ZeroAddress,   // ETH
        amountFrom: order.amountFrom,
        minAmountTo: order.minAmountTo,
        expiry: order.expiry,
        nonce: order.nonce
      };

      const signature = await signer.signTypedData(domain, types, value);
      order.signature = signature;

      // Submit to orderbook
      const response = await fetch(`${ORDERBOOK_API}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
      });

      if (response.ok) {
        alert('Order created successfully!');
        setAmountFrom('');
        setMinAmountTo('');
        loadOrders();
      } else {
        const error = await response.text();
        alert(`Failed to create order: ${error}`);
      }

    } catch (error) {
      console.error('Failed to create order:', error);
      alert('Failed to create order: ' + (error as Error).message);
    }
  };

  const formatAmount = (amount: string) => {
    try {
      return ethers.formatEther(amount);
    } catch {
      return '0';
    }
  };

  const formatAddress = (address: string) => {
    return address.slice(0, 6) + '...' + address.slice(-4);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🔥 Fusion+ Protocol</h1>
        <p>Cross-Chain Swap Intent Resolution</p>
        
        {!connected ? (
          <button onClick={connectWallet} className="connect-button">
            Connect Wallet
          </button>
        ) : (
          <div className="wallet-info">
            <p>Connected: {formatAddress(account)}</p>
          </div>
        )}
      </header>

      <main className="main-content">
        <div className="create-order-section">
          <h2>Create Swap Order</h2>
          <div className="order-form">
            <div className="form-row">
              <div className="form-group">
                <label>From Token:</label>
                <select value={tokenFrom} onChange={(e) => setTokenFrom(e.target.value)}>
                  <option value="ETH">ETH</option>
                </select>
              </div>
              <div className="form-group">
                <label>To Token:</label>
                <select value={tokenTo} onChange={(e) => setTokenTo(e.target.value)}>
                  <option value="ETH">ETH</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Amount From:</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountFrom}
                  onChange={(e) => setAmountFrom(e.target.value)}
                  placeholder="0.1"
                />
              </div>
              <div className="form-group">
                <label>Min Amount To:</label>
                <input
                  type="number"
                  step="0.01"
                  value={minAmountTo}
                  onChange={(e) => setMinAmountTo(e.target.value)}
                  placeholder="0.09"
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Destination Address:</label>
              <input
                type="text"
                value={destAddress}
                onChange={(e) => setDestAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            
            <button 
              onClick={createOrder} 
              disabled={!connected}
              className="create-order-button"
            >
              Create Order
            </button>
          </div>
        </div>

        <div className="orders-section">
          <h2>Open Orders ({orders.length})</h2>
          <div className="orders-list">
            {orders.length === 0 ? (
              <p className="no-orders">No open orders</p>
            ) : (
              orders.map((order) => (
                <div key={order.orderId} className="order-card">
                  <div className="order-header">
                    <strong>Order ID:</strong> {formatAddress(order.orderId)}
                    <span className={`status ${order.status}`}>{order.status}</span>
                  </div>
                  <div className="order-details">
                    <div className="detail-row">
                      <span>From:</span> {formatAmount(order.amountFrom)} {order.tokenFrom}
                    </div>
                    <div className="detail-row">
                      <span>To:</span> {formatAmount(order.minAmountTo)} {order.tokenTo} (min)
                    </div>
                    <div className="detail-row">
                      <span>Requester:</span> {formatAddress(order.requester)}
                    </div>
                    <div className="detail-row">
                      <span>Destination:</span> {formatAddress(order.requesterDestAddr)}
                    </div>
                    <div className="detail-row">
                      <span>Expires:</span> {formatTime(order.expiry * 1000)}
                    </div>
                    <div className="detail-row">
                      <span>Created:</span> {formatTime(order.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;