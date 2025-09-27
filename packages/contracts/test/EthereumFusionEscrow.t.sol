// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/EthereumFusionEscrow.sol";
import "../src/EthereumResolverStaking.sol";

contract EthereumFusionEscrowTest is Test {
    EthereumFusionEscrow public escrow;
    EthereumResolverStaking public staking;
    
    address public requester = address(0x1111);
    address public resolver = address(0x2222);
    address public otherUser = address(0x3333);
    
    bytes32 public constant ORDER_ID = keccak256("test_order_1");
    bytes32 public constant SECRET_HASH = keccak256("secret123");
    string public constant SECRET = "secret123";
    
    function setUp() public {
        staking = new EthereumResolverStaking();
        escrow = new EthereumFusionEscrow();
        
        // Authorize escrow to update resolver stats
        staking.authorizeSlasher(address(escrow));
        
        // Fund test accounts
        vm.deal(requester, 10 ether);
        vm.deal(resolver, 10 ether);
        vm.deal(otherUser, 10 ether);
        
        // Register resolver
        vm.prank(resolver);
        escrow.registerResolver{value: 2 ether}();
    }
    
    function testRegisterResolver() public {
        vm.prank(otherUser);
        escrow.registerResolver{value: 1 ether}();
        
        assertEq(escrow.resolverStakes(otherUser), 1 ether);
    }
    
    function testRegisterResolverInsufficientStake() public {
        vm.prank(otherUser);
        vm.expectRevert("Insufficient stake");
        escrow.registerResolver{value: 0.5 ether}();
    }
    
    function testCreateOrderETH() public {
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0), // ETH
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        EthereumFusionEscrow.Order memory order = escrow.getOrder(ORDER_ID);
        assertEq(order.requester, requester);
        assertEq(order.resolver, resolver);
        assertEq(order.tokenIn, address(0));
        assertEq(order.amountIn, 1 ether);
        assertEq(order.secretHash, SECRET_HASH);
        assertFalse(order.executed);
        assertFalse(order.refunded);
    }
    
    function testCreateOrderInvalidResolver() public {
        vm.prank(requester);
        vm.expectRevert("Resolver not registered");
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            otherUser, // Not registered
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
    }
    
    function testCreateOrderDuplicateId() public {
        // Create first order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Try to create duplicate
        vm.prank(requester);
        vm.expectRevert("Order already exists");
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
    }
    
    function testExecuteOrder() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        uint256 resolverBalanceBefore = resolver.balance;
        
        // Execute order
        vm.prank(resolver);
        escrow.executeOrder(ORDER_ID, SECRET);
        
        // Check order is executed
        EthereumFusionEscrow.Order memory order = escrow.getOrder(ORDER_ID);
        assertTrue(order.executed);
        assertFalse(order.refunded);
        
        // Check resolver received ETH
        assertEq(resolver.balance, resolverBalanceBefore + 1 ether);
    }
    
    function testExecuteOrderWrongSecret() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Try to execute with wrong secret
        vm.prank(resolver);
        vm.expectRevert("Invalid secret");
        escrow.executeOrder(ORDER_ID, "wrong_secret");
    }
    
    function testExecuteOrderUnauthorized() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Try to execute as different user
        vm.prank(otherUser);
        vm.expectRevert("Only designated resolver");
        escrow.executeOrder(ORDER_ID, SECRET);
    }
    
    function testRefundOrderAfterExpiry() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Fast forward past expiry
        vm.warp(block.timestamp + 3 hours);
        
        uint256 requesterBalanceBefore = requester.balance;
        
        // Refund order
        vm.prank(requester);
        escrow.refundOrder(ORDER_ID);
        
        // Check order is refunded
        EthereumFusionEscrow.Order memory order = escrow.getOrder(ORDER_ID);
        assertFalse(order.executed);
        assertTrue(order.refunded);
        
        // Check requester received refund
        assertEq(requester.balance, requesterBalanceBefore + 1 ether);
    }
    
    function testRefundOrderBeforeExpiry() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Try to refund before expiry
        vm.prank(requester);
        vm.expectRevert("Order not expired");
        escrow.refundOrder(ORDER_ID);
    }
    
    function testRefundOrderUnauthorized() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Fast forward past expiry
        vm.warp(block.timestamp + 3 hours);
        
        // Try to refund as different user
        vm.prank(otherUser);
        vm.expectRevert("Only requester");
        escrow.refundOrder(ORDER_ID);
    }
    
    function testIsOrderActive() public {
        // Create order
        vm.prank(requester);
        escrow.createOrder{value: 1 ether}(
            ORDER_ID,
            resolver,
            address(0),
            1 ether,
            SECRET_HASH,
            2 hours
        );
        
        // Should be active initially
        assertTrue(escrow.isOrderActive(ORDER_ID));
        
        // Execute order
        vm.prank(resolver);
        escrow.executeOrder(ORDER_ID, SECRET);
        
        // Should not be active after execution
        assertFalse(escrow.isOrderActive(ORDER_ID));
    }
    
    function testWithdrawStake() public {
        uint256 resolverBalanceBefore = resolver.balance;
        
        // Withdraw partial stake
        vm.prank(resolver);
        escrow.withdrawStake(0.5 ether);
        
        assertEq(escrow.resolverStakes(resolver), 1.5 ether);
        assertEq(resolver.balance, resolverBalanceBefore + 0.5 ether);
    }
    
    function testWithdrawStakeInsufficientMinimum() public {
        // Try to withdraw too much (leaving less than minimum)
        vm.prank(resolver);
        vm.expectRevert("Must maintain minimum stake");
        escrow.withdrawStake(1.5 ether);
    }
}