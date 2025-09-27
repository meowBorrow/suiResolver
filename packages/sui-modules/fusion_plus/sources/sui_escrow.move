/// Fusion+ Sui Escrow Module - Simplified Version
module fusion_plus::sui_escrow {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::clock::{Self, Clock};

    // Constants
    const MIN_RESOLVER_STAKE: u64 = 1_000_000_000; // 1 SUI

    // Structs
    public struct Order has key, store {
        id: UID,
        order_id: vector<u8>,
        requester: address,
        resolver: address,
        amount_in: u64,
        secret_hash: vector<u8>,
        expiry: u64,
        executed: bool,
        refunded: bool,
        sui_balance: Balance<SUI>,
    }

    public struct ResolverRegistry has key {
        id: UID,
        resolvers: vector<address>,
        stakes: vector<u64>,
    }

    // Events
    public struct OrderCreated has copy, drop {
        order_id: vector<u8>,
        requester: address,
        resolver: address,
        amount_in: u64,
        secret_hash: vector<u8>,
        expiry: u64,
    }

    public struct OrderExecuted has copy, drop {
        order_id: vector<u8>,
        resolver: address,
        secret: vector<u8>,
    }

    // Initialize the module
    fun init(ctx: &mut TxContext) {
        let registry = ResolverRegistry {
            id: object::new(ctx),
            resolvers: vector::empty(),
            stakes: vector::empty(),
        };
        
        transfer::share_object(registry);
    }

    // Register as a resolver by staking SUI
    public fun register_resolver(
        registry: &mut ResolverRegistry,
        stake: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let stake_amount = coin::value(&stake);
        assert!(stake_amount >= MIN_RESOLVER_STAKE, 1);
        
        let resolver = tx_context::sender(ctx);
        
        vector::push_back(&mut registry.resolvers, resolver);
        vector::push_back(&mut registry.stakes, stake_amount);

        // Transfer stake to registry (simplified)
        transfer::public_transfer(stake, @fusion_plus);
    }

    // Check if resolver is registered
    public fun is_resolver_registered(registry: &ResolverRegistry, resolver: address): bool {
        let len = vector::length(&registry.resolvers);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&registry.resolvers, i) == resolver) {
                let stake = *vector::borrow(&registry.stakes, i);
                return stake >= MIN_RESOLVER_STAKE
            };
            i = i + 1;
        };
        false
    }

    // Test-only functions
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}