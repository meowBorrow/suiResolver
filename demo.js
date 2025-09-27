#!/usr/bin/env node

const { ethers } = require('ethers');

const ESCROW_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const STAKING_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const RPC_URL = 'http://localhost:8545';
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const ESCROW_ABI = [
  'function createOrder(bytes32 orderId, address requesterDestAddr, uint256 chainFrom, uint256 chainTo, address tokenFrom, address tokenTo, uint256 amountFrom, uint256 minAmountTo, uint256 expiry, uint256 nonce, bytes signature) external payable',
  'function executeOrder(bytes32 orderId, address resolver) external payable',
  'function orders(bytes32) external view returns (address requester, address requesterDestAddr, uint256 chainFrom, uint256 chainTo, address tokenFrom, address tokenTo, uint256 amountFrom, uint256 minAmountTo, uint256 expiry, uint256 nonce, uint8 status)',
  'event OrderCreated(bytes32 indexed orderId, address indexed requester)',
  'event OrderExecuted(bytes32 indexed orderId, address indexed resolver)'
];

const STAKING_ABI = [
  'function stake() external payable',
  'function resolvers(address) external view returns (uint256 stakedAmount, uint256 reputation, uint256 totalSwaps, uint256 successfulSwaps, uint256 lastSlashTime, bool isActive)',
  'function isResolverEligible(address resolver) external view returns (bool)'
];

async function main() {
  console.log('🔥 Fusion+ Protocol Demo Script');
  console.log('================================');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log(`📱 Using wallet: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);

  // Connect to contracts
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
  const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, wallet);

  console.log(`\n📋 Contract Addresses:`);
  console.log(`   Escrow: ${ESCROW_ADDRESS}`);
  console.log(`   Staking: ${STAKING_ADDRESS}`);

  try {
    // 1. Check if already staked
    console.log('\n🏛 Checking staking status...');
    const resolverInfo = await staking.resolvers(wallet.address);
    const currentStake = resolverInfo[0]; // stakedAmount
    const isActive = resolverInfo[5]; // isActive
    const isEligible = await staking.isResolverEligible(wallet.address);
    
    console.log(`   Current stake: ${ethers.formatEther(currentStake)} ETH`);
    console.log(`   Is active: ${isActive}`);
    console.log(`   Is eligible: ${isEligible}`);

    // 2. Stake if needed
    if (currentStake < ethers.parseEther('1.0')) {
      console.log('\n💎 Staking 1.0 ETH to become resolver...');
      const stakeTx = await staking.stake({ value: ethers.parseEther('1.0') });
      console.log(`   Transaction: ${stakeTx.hash}`);
      await stakeTx.wait();
      console.log('   ✅ Staking complete!');
    } else {
      console.log('   ✅ Already staked sufficient amount');
    }

    // 3. Create a demo order
    console.log('\n📝 Creating demo swap order...');
    
    const orderId = ethers.keccak256(ethers.toUtf8Bytes(`order_${Date.now()}`));
    const order = {
      orderId: orderId,
      requester: wallet.address,
      requesterDestAddr: wallet.address,
      chainFrom: 1, // Ethereum
      chainTo: 1,   // Ethereum  
      tokenFrom: ethers.ZeroAddress, // ETH
      tokenTo: ethers.ZeroAddress,   // ETH
      amountFrom: ethers.parseEther('0.1'),
      minAmountTo: ethers.parseEther('0.09'),
      expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      nonce: Date.now()
    };

    // Create EIP-712 signature
    console.log('   🔐 Creating EIP-712 signature...');
    const domain = {
      name: 'Fusion+',
      version: '1',
      chainId: 31337,
      verifyingContract: ESCROW_ADDRESS
    };

    const types = {
      Order: [
        { name: 'orderId', type: 'bytes32' },
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

    const signature = await wallet.signTypedData(domain, types, order);

    // Submit order to contract
    console.log('   📤 Submitting order to escrow contract...');
    const createTx = await escrow.createOrder(
      order.orderId,
      order.requesterDestAddr,
      order.chainFrom,
      order.chainTo,
      order.tokenFrom,
      order.tokenTo,
      order.amountFrom,
      order.minAmountTo,
      order.expiry,
      order.nonce,
      signature,
      { value: order.amountFrom }
    );

    console.log(`   Transaction: ${createTx.hash}`);
    const receipt = await createTx.wait();
    console.log(`   ✅ Order created in block ${receipt.blockNumber}!`);

    // 4. Check order status
    console.log('\n🔍 Checking order status...');
    const orderData = await escrow.orders(orderId);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Requester: ${orderData[0]}`);
    console.log(`   Amount From: ${ethers.formatEther(orderData[6])} ETH`);
    console.log(`   Min Amount To: ${ethers.formatEther(orderData[7])} ETH`);
    console.log(`   Status: ${orderData[10]} (0=Created, 1=Executed, 2=Refunded)`);

    // 5. Simulate resolver execution
    console.log('\n⚡ Simulating resolver execution...');
    const executeTx = await escrow.executeOrder(orderId, wallet.address, {
      value: order.minAmountTo // Resolver provides the output amount
    });

    console.log(`   Transaction: ${executeTx.hash}`);
    const executeReceipt = await executeTx.wait();
    console.log(`   ✅ Order executed in block ${executeReceipt.blockNumber}!`);

    // 6. Final status check
    console.log('\n✅ Demo completed successfully!');
    const finalOrderData = await escrow.orders(orderId);
    console.log(`   Final order status: ${finalOrderData[10]}`);

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`   Final wallet balance: ${ethers.formatEther(finalBalance)} ETH`);

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    if (error.reason) {
      console.error('   Reason:', error.reason);
    }
  }
}

main().catch(console.error);