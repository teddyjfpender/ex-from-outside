/**
 * Test setup and utilities for E2E tests
 */

import { RpcProvider, Account, constants, Provider, SignerInterface } from 'starknet';
import type { NetworkEnvironment } from './types';

/**
 * Custom RPC Provider for devnet compatibility
 */
class DevnetRpcProvider extends RpcProvider {
  constructor(options: any = {}) {
    // Override default options for devnet compatibility
    const devnetOptions = {
      nodeUrl: DEVNET_CONFIG.rpcUrl,
      chainId: DEVNET_CONFIG.chainId,
      // Disable strict spec version checking for devnet
      headers: {
        'Content-Type': 'application/json',
      },
      // Set default block identifier to 'latest'
      defaultBlockId: 'latest',
      // Be more lenient with RPC responses
      retries: 3,
      requestTimeout: 30000,
      ...options,
    };

    super(devnetOptions);
  }

  /**
   * Override getBlock to handle devnet's block identifier limitations
   */
  async getBlock(blockIdentifier = 'latest') {
    // Ensure we use 'latest' for devnet compatibility
    const safeBlockId = blockIdentifier === 'pending' ? 'latest' : blockIdentifier;
    return super.getBlock(safeBlockId);
  }

  /**
   * Override getClassHashAt to use 'latest' by default
   */
  async getClassHashAt(contractAddress: string, blockIdentifier = 'latest') {
    const safeBlockId = blockIdentifier === 'pending' ? 'latest' : blockIdentifier;
    return super.getClassHashAt(contractAddress, safeBlockId);
  }

  /**
   * Override callContract to use 'latest' by default
   */
  async callContract(call: any, blockIdentifier = 'latest') {
    const safeBlockId = blockIdentifier === 'pending' ? 'latest' : blockIdentifier;
    return super.callContract(call, safeBlockId);
  }

  /**
   * Override getChainId to handle spec version issues gracefully
   */
  async getChainId() {
    try {
      return await super.getChainId();
    } catch (error: any) {
      // Handle LibraryError for spec version compatibility
      if (error.message?.includes('specification version is not supported')) {
        console.warn('⚠️  Starknet.js spec version warning - continuing with devnet compatibility mode');
        // Return the devnet chain ID directly
        return DEVNET_CONFIG.chainId;
      }
      throw error;
    }
  }
}

/**
 * Custom Account class that overrides default block identifiers for devnet compatibility
 * Fixes issue where starknet.js v7+ defaults to "pending" but devnet v0.5.0-rc.4 only supports "latest", "pre_confirmed", "l1_accepted"
 */
class DevnetAccount extends Account {
  constructor(
    provider: Provider, 
    address: string, 
    signer: SignerInterface | string,
    cairoVersion?: string,
    transactionVersion?: string
  ) {
    // Use newer constructor signature for starknet.js v7+
    const accountOptions = {
      address,
      provider,
      signer,
      cairoVersion: cairoVersion || '1',
      transactionVersion
    };
    super(accountOptions);
  }

  /**
   * Override getNonce to use 'latest' instead of 'pending' for devnet compatibility
   */
  async getNonce(blockIdentifier = 'latest') {
    return super.getNonce(blockIdentifier);
  }

  /**
   * Override estimateInvokeFee to use 'latest' block identifier by default
   */
  async estimateInvokeFee(calls: any, options: any = {}) {
    const optionsWithLatest = {
      blockIdentifier: 'latest',
      ...options,
    };
    return super.estimateInvokeFee(calls, optionsWithLatest);
  }

  /**
   * Override estimateDeclareFee to use 'latest' block identifier by default
   */
  async estimateDeclareFee(payload: any, options: any = {}) {
    const optionsWithLatest = {
      blockIdentifier: 'latest',
      ...options,
    };
    return super.estimateDeclareFee(payload, optionsWithLatest);
  }

  /**
   * Override estimateDeployFee to use 'latest' block identifier by default
   */
  async estimateDeployFee(payload: any, options: any = {}) {
    const optionsWithLatest = {
      blockIdentifier: 'latest',
      ...options,
    };
    return super.estimateDeployFee(payload, optionsWithLatest);
  }

  /**
   * Override execute to ensure transaction uses devnet-compatible settings
   */
  async execute(calls: any, abis?: any, transactionsDetail: any = {}) {
    const detailsWithDefaults = {
      blockIdentifier: 'latest',
      ...transactionsDetail,
    };
    return super.execute(calls, abis, detailsWithDefaults);
  }
}

/**
 * Devnet configuration based on the devnet-info.ts file
 * Multiple accounts for trading simulation
 */
export const DEVNET_CONFIG = {
  rpcUrl: 'http://127.0.0.1:5050',
  chainId: constants.StarknetChainId.SN_SEPOLIA, // Devnet uses Sepolia chain ID
  accounts: [
    {
      address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
      privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
      role: 'admin',
    },
    {
      address: '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1',
      privateKey: '0x000000000000000000000000000000000e1406455b7d66b1690803be066cbe5e',
      role: 'user1',
    },
    {
      address: '0x049dfb8ce986e21d354ac93ea65e6a11f639c1934ea253e5ff14ca62eca0f38e',
      privateKey: '0x00000000000000000000000000000000a20a02f0ac53692d144b20cb371a60d7',
      role: 'user2',
    },
    {
      address: '0x04f348398f859a55a0c80b1446c5fdc37edb3a8478a32f10764659fc241027d3',
      privateKey: '0x00000000000000000000000000000000a641611c17d4d92bd0790074e34beeb7',
      role: 'user3',
    },
    {
      address: '0x00d513de92c16aa42418cf7e5b60f8022dbee1b4dfd81bcf03ebee079cfb5cb5',
      privateKey: '0x000000000000000000000000000000005b4ac23628a5749277bcabbf4726b025',
      role: 'user4',
    },
  ],
  // Legacy single account for backward compatibility
  account: {
    address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
    privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
  },
  tokens: {
    eth: {
      address: '0x49D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7',
      decimals: 18,
    },
    strk: {
      address: '0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D',
      decimals: 18,
    },
  },
} as const;

/**
 * Create a network environment for testing
 */
export function createTestNetworkEnvironment(): NetworkEnvironment {
  return {
    network: {
      name: 'devnet',
      type: 'dev',
      chainId: DEVNET_CONFIG.chainId,
      rpcUrl: DEVNET_CONFIG.rpcUrl,
    },
    account: {
      address: DEVNET_CONFIG.account.address,
      privateKey: DEVNET_CONFIG.account.privateKey,
    },
    options: {
      compilerVersion: '2.7.1',
      timeout: 300000, // 5 minutes for tests
    },
  };
}

/**
 * Create a devnet-compatible provider for testing
 */
export function createTestProvider(): RpcProvider {
  return new RpcProvider({
    nodeUrl: DEVNET_CONFIG.rpcUrl,
    chainId: DEVNET_CONFIG.chainId,
  });
}

/**
 * Create a devnet-compatible account for testing
 */
export function createTestAccount(provider?: RpcProvider): DevnetAccount {
  const testProvider = provider || createTestProvider();
  return new DevnetAccount(
    testProvider,
    DEVNET_CONFIG.account.address,
    DEVNET_CONFIG.account.privateKey,
    '1' // Account version
  );
}

/**
 * Wait for devnet to be available
 */
export async function waitForDevnet(
  maxRetries: number = 10,
  retryDelay: number = 1000
): Promise<void> {
  const provider = createTestProvider();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await provider.getChainId();
      console.log('✓ Devnet is available');
      return;
    } catch (error) {
      console.log(`⏳ Devnet not ready, retrying... (${i + 1}/${maxRetries})`);
      if (i === maxRetries - 1) {
        throw new Error(`Devnet not available after ${maxRetries} retries. Make sure devnet is running on ${DEVNET_CONFIG.rpcUrl}`);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Check if devnet is running
 */
export async function isDevnetRunning(): Promise<boolean> {
  try {
    const provider = createTestProvider();
    await provider.getChainId();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get devnet account balance
 */
export async function getAccountBalance(account?: DevnetAccount): Promise<{
  eth: bigint;
  strk: bigint;
}> {
  const testAccount = account || createTestAccount();
  
  // Standard ETH and STRK token addresses on devnet
  const ethAddress = '0x49D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7';
  const strkAddress = '0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D';
  
  try {
    const [ethBalance, strkBalance] = await Promise.all([
      testAccount.callContract({
        contractAddress: ethAddress,
        entrypoint: 'balanceOf',
        calldata: [testAccount.address],
      }),
      testAccount.callContract({
        contractAddress: strkAddress,
        entrypoint: 'balanceOf',
        calldata: [testAccount.address],
      }),
    ]);
    
    return {
      eth: BigInt(ethBalance[0] || 0),
      strk: BigInt(strkBalance[0] || 0),
    };
  } catch (error) {
    console.warn('Failed to get account balance:', error);
    return { eth: 0n, strk: 0n };
  }
}

/**
 * Test helper to format balances
 */
export function formatBalance(balance: bigint, decimals: number = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const major = balance / divisor;
  const minor = balance % divisor;
  return `${major}.${minor.toString().padStart(decimals, '0').slice(0, 6)}`;
}

/**
 * Create account by role or index
 */
export function createAccountByRole(role: string, provider?: RpcProvider): DevnetAccount {
  const testProvider = provider || createTestProvider();
  const accountConfig = DEVNET_CONFIG.accounts.find(acc => acc.role === role);
  
  if (!accountConfig) {
    throw new Error(`Account with role '${role}' not found`);
  }
  
  return new DevnetAccount(
    testProvider,
    accountConfig.address,
    accountConfig.privateKey,
    '1' // Account version
  );
}

/**
 * Create all trading accounts
 */
export function createTradingAccounts(provider?: RpcProvider): {
  deployer: DevnetAccount;
  maker1: DevnetAccount;
  maker2: DevnetAccount;
  taker1: DevnetAccount;
  taker2: DevnetAccount;
} {
  const testProvider = provider || createTestProvider();
  
  return {
    deployer: createAccountByRole('admin', testProvider),
    maker1: createAccountByRole('user1', testProvider),
    maker2: createAccountByRole('user2', testProvider),
    taker1: createAccountByRole('user3', testProvider),
    taker2: createAccountByRole('user4', testProvider),
  };
}

/**
 * Format gas cost for display
 */
export function formatGasCost(gasCost: bigint, tokenSymbol: string = 'STRK'): string {
  const formatted = formatBalance(gasCost);
  return `${formatted} ${tokenSymbol}`;
}

/**
 * Clean up helper - not needed for stateless tests but useful for future extensions
 */
export async function cleanup(): Promise<void> {
  // Add any cleanup logic here if needed
  console.log('✓ Test cleanup completed');
}