import { ethers } from 'ethers';
import { ValidationResult } from '../types';
import { Logger } from '../utils/Logger';

export class ValidationService {
  private logger = new Logger('ValidationService');

  async validateOrder(orderData: any): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      // Required fields validation
      if (!orderData.orderId) errors.push('orderId is required');
      if (!orderData.requester) errors.push('requester is required');
      if (!orderData.requesterDestAddr) errors.push('requesterDestAddr is required');
      if (!orderData.chainFrom) errors.push('chainFrom is required');
      if (!orderData.chainTo) errors.push('chainTo is required');
      if (!orderData.tokenFrom) errors.push('tokenFrom is required');
      if (!orderData.tokenTo) errors.push('tokenTo is required');
      if (!orderData.amountFrom) errors.push('amountFrom is required');
      if (!orderData.minAmountTo) errors.push('minAmountTo is required');
      if (!orderData.expiry) errors.push('expiry is required');
      if (!orderData.signature) errors.push('signature is required');
      if (!orderData.signatureType) errors.push('signatureType is required');

      // Chain validation
      const validChains = ['ethereum', 'sui'];
      if (orderData.chainFrom && !validChains.includes(orderData.chainFrom)) {
        errors.push('Invalid chainFrom');
      }
      if (orderData.chainTo && !validChains.includes(orderData.chainTo)) {
        errors.push('Invalid chainTo');
      }
      if (orderData.chainFrom === orderData.chainTo) {
        errors.push('chainFrom and chainTo must be different');
      }

      // Address validation
      if (orderData.requester && !this.isValidAddress(orderData.requester, orderData.chainFrom)) {
        errors.push('Invalid requester address');
      }
      if (orderData.requesterDestAddr && !this.isValidAddress(orderData.requesterDestAddr, orderData.chainTo)) {
        errors.push('Invalid requesterDestAddr address');
      }

      // Amount validation
      if (orderData.amountFrom) {
        try {
          const amount = BigInt(orderData.amountFrom);
          if (amount <= 0) errors.push('amountFrom must be positive');
        } catch {
          errors.push('Invalid amountFrom format');
        }
      }

      if (orderData.minAmountTo) {
        try {
          const amount = BigInt(orderData.minAmountTo);
          if (amount <= 0) errors.push('minAmountTo must be positive');
        } catch {
          errors.push('Invalid minAmountTo format');
        }
      }

      // Expiry validation
      if (orderData.expiry) {
        const expiry = Number(orderData.expiry);
        const now = Date.now();
        if (expiry <= now) {
          errors.push('Order expiry must be in the future');
        }
        if (expiry > now + (24 * 60 * 60 * 1000)) { // 24 hours
          errors.push('Order expiry too far in the future (max 24 hours)');
        }
      }

      // Signature validation
      const signatureValid = await this.validateSignature(orderData);
      if (!signatureValid) {
        errors.push('Invalid signature');
      }

    } catch (error) {
      this.logger.error('Error validating order:', error);
      errors.push('Validation error occurred');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async validateBid(bidData: any): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      // Required fields validation
      if (!bidData.bidId) errors.push('bidId is required');
      if (!bidData.orderId) errors.push('orderId is required');
      if (!bidData.resolver) errors.push('resolver is required');
      if (!bidData.bidAmount) errors.push('bidAmount is required');

      // Amount validation
      if (bidData.bidAmount) {
        try {
          const amount = BigInt(bidData.bidAmount);
          if (amount <= 0) errors.push('bidAmount must be positive');
        } catch {
          errors.push('Invalid bidAmount format');
        }
      }

      // Gas price validation
      if (bidData.gasPrice) {
        try {
          const gasPrice = BigInt(bidData.gasPrice);
          if (gasPrice < 0) errors.push('gasPrice cannot be negative');
        } catch {
          errors.push('Invalid gasPrice format');
        }
      }

      // Execution time validation
      if (bidData.executionTime !== undefined) {
        const execTime = Number(bidData.executionTime);
        if (execTime < 30 || execTime > 3600) { // 30 seconds to 1 hour
          errors.push('executionTime must be between 30 and 3600 seconds');
        }
      }

      // Reputation validation
      if (bidData.reputation !== undefined) {
        const reputation = Number(bidData.reputation);
        if (reputation < 0 || reputation > 1000) {
          errors.push('reputation must be between 0 and 1000');
        }
      }

    } catch (error) {
      this.logger.error('Error validating bid:', error);
      errors.push('Validation error occurred');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private isValidAddress(address: string, chain: string): boolean {
    try {
      if (chain === 'ethereum') {
        return ethers.isAddress(address);
      } else if (chain === 'sui') {
        // Basic Sui address validation (starts with 0x and is 66 chars)
        return /^0x[a-fA-F0-9]{64}$/.test(address);
      }
      return false;
    } catch {
      return false;
    }
  }

  private async validateSignature(orderData: any): Promise<boolean> {
    try {
      if (orderData.signatureType === 'eip712') {
        return this.validateEIP712Signature(orderData);
      } else if (orderData.signatureType === 'sui') {
        return this.validateSuiSignature(orderData);
      }
      return false;
    } catch (error) {
      this.logger.error('Signature validation error:', error);
      return false;
    }
  }

  private validateEIP712Signature(orderData: any): boolean {
    try {
      // EIP-712 domain
      const domain = {
        name: 'Fusion+',
        version: '1',
        chainId: 1, // Mainnet for now, should be configurable
        verifyingContract: '0x0000000000000000000000000000000000000000' // Should be actual contract
      };

      // Order type
      const types = {
        Order: [
          { name: 'orderId', type: 'bytes32' },
          { name: 'requester', type: 'address' },
          { name: 'requesterDestAddr', type: 'string' },
          { name: 'chainFrom', type: 'string' },
          { name: 'chainTo', type: 'string' },
          { name: 'tokenFrom', type: 'address' },
          { name: 'tokenTo', type: 'string' },
          { name: 'amountFrom', type: 'uint256' },
          { name: 'minAmountTo', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const value = {
        orderId: orderData.orderId,
        requester: orderData.requester,
        requesterDestAddr: orderData.requesterDestAddr,
        chainFrom: orderData.chainFrom,
        chainTo: orderData.chainTo,
        tokenFrom: orderData.tokenFrom,
        tokenTo: orderData.tokenTo,
        amountFrom: orderData.amountFrom,
        minAmountTo: orderData.minAmountTo,
        expiry: orderData.expiry,
        nonce: orderData.nonce || 0
      };

      // Verify signature (simplified - in production use proper EIP-712)
      const digest = ethers.TypedDataEncoder.hash(domain, types, value);
      const recoveredAddress = ethers.recoverAddress(digest, orderData.signature);
      
      return recoveredAddress.toLowerCase() === orderData.requester.toLowerCase();
    } catch (error) {
      this.logger.error('EIP-712 validation error:', error);
      return false;
    }
  }

  private validateSuiSignature(orderData: any): boolean {
    // Simplified Sui signature validation
    // In production, this should use proper Sui cryptography
    try {
      return orderData.signature && orderData.signature.length > 0;
    } catch (error) {
      this.logger.error('Sui signature validation error:', error);
      return false;
    }
  }
}