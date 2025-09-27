// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EthereumFusionEscrow
 * @notice Core escrow contract for Fusion+ cross-chain swaps on Ethereum
 * @dev Handles intent-based order creation and execution with hash time locks
 */
contract EthereumFusionEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Events
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed requester,
        address indexed resolver,
        address tokenIn,
        uint256 amountIn,
        bytes32 secretHash,
        uint256 expiry
    );

    event OrderExecuted(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secret
    );

    event OrderRefunded(
        bytes32 indexed orderId,
        address indexed requester
    );

    event ResolverRegistered(
        address indexed resolver,
        uint256 stakeAmount
    );

    // Structs
    struct Order {
        address requester;
        address resolver;
        address tokenIn;
        uint256 amountIn;
        bytes32 secretHash;
        uint256 expiry;
        bool executed;
        bool refunded;
    }

    // State variables
    mapping(bytes32 => Order) public orders;
    mapping(address => uint256) public resolverStakes;
    
    uint256 public constant MIN_RESOLVER_STAKE = 1 ether;
    uint256 public constant MIN_LOCK_DURATION = 1 hours;
    uint256 public constant MAX_LOCK_DURATION = 24 hours;

    address public constant ETH_ADDRESS = address(0);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register as a resolver by staking ETH
     */
    function registerResolver() external payable {
        require(msg.value >= MIN_RESOLVER_STAKE, "Insufficient stake");
        resolverStakes[msg.sender] += msg.value;
        emit ResolverRegistered(msg.sender, msg.value);
    }

    /**
     * @notice Create a cross-chain swap order
     * @param orderId Unique identifier for the order
     * @param resolver Address of the resolver to fulfill the order
     * @param tokenIn Token to swap (address(0) for ETH)
     * @param amountIn Amount to swap
     * @param secretHash Hash of the secret for atomic swap
     * @param lockDuration Duration to lock funds
     */
    function createOrder(
        bytes32 orderId,
        address resolver,
        address tokenIn,
        uint256 amountIn,
        bytes32 secretHash,
        uint256 lockDuration
    ) external payable nonReentrant {
        require(orders[orderId].requester == address(0), "Order already exists");
        require(resolver != address(0), "Invalid resolver");
        require(resolverStakes[resolver] >= MIN_RESOLVER_STAKE, "Resolver not registered");
        require(lockDuration >= MIN_LOCK_DURATION && lockDuration <= MAX_LOCK_DURATION, "Invalid lock duration");
        require(secretHash != bytes32(0), "Invalid secret hash");

        uint256 expiry = block.timestamp + lockDuration;

        if (tokenIn == ETH_ADDRESS) {
            require(msg.value == amountIn, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not expected");
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        orders[orderId] = Order({
            requester: msg.sender,
            resolver: resolver,
            tokenIn: tokenIn,
            amountIn: amountIn,
            secretHash: secretHash,
            expiry: expiry,
            executed: false,
            refunded: false
        });

        emit OrderCreated(orderId, msg.sender, resolver, tokenIn, amountIn, secretHash, expiry);
    }

    /**
     * @notice Execute order by revealing the secret (resolver only)
     * @param orderId Order to execute
     * @param secret The secret that hashes to secretHash
     */
    function executeOrder(bytes32 orderId, string calldata secret) external nonReentrant {
        Order storage order = orders[orderId];
        
        require(order.requester != address(0), "Order does not exist");
        require(msg.sender == order.resolver, "Only designated resolver");
        require(!order.executed && !order.refunded, "Order already processed");
        require(block.timestamp <= order.expiry, "Order expired");
        require(keccak256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");

        order.executed = true;

        // Transfer tokens to resolver
        if (order.tokenIn == ETH_ADDRESS) {
            payable(order.resolver).transfer(order.amountIn);
        } else {
            IERC20(order.tokenIn).safeTransfer(order.resolver, order.amountIn);
        }

        emit OrderExecuted(orderId, order.resolver, keccak256(abi.encodePacked(secret)));
    }

    /**
     * @notice Refund order after expiry (requester only)
     * @param orderId Order to refund
     */
    function refundOrder(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        
        require(order.requester != address(0), "Order does not exist");
        require(msg.sender == order.requester, "Only requester");
        require(!order.executed && !order.refunded, "Order already processed");
        require(block.timestamp > order.expiry, "Order not expired");

        order.refunded = true;

        // Refund tokens to requester
        if (order.tokenIn == ETH_ADDRESS) {
            payable(order.requester).transfer(order.amountIn);
        } else {
            IERC20(order.tokenIn).safeTransfer(order.requester, order.amountIn);
        }

        emit OrderRefunded(orderId, order.requester);
    }

    /**
     * @notice Withdraw resolver stake (resolver only)
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 amount) external nonReentrant {
        require(resolverStakes[msg.sender] >= amount, "Insufficient stake");
        require(resolverStakes[msg.sender] - amount >= MIN_RESOLVER_STAKE, "Must maintain minimum stake");
        
        resolverStakes[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    /**
     * @notice Get order details
     * @param orderId Order ID to query
     */
    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /**
     * @notice Check if order is active (not executed, refunded, or expired)
     * @param orderId Order ID to check
     */
    function isOrderActive(bytes32 orderId) external view returns (bool) {
        Order memory order = orders[orderId];
        return order.requester != address(0) && 
               !order.executed && 
               !order.refunded && 
               block.timestamp <= order.expiry;
    }
}