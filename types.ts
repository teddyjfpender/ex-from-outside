
/**
 * Network configuration
 */
export interface NetworkConfig {
  name: string;
  type: 'mainnet' | 'testnet' | 'dev';
  chainId: string;
  rpcUrl: string;
}

/**
 * Account configuration
 */
export interface AccountConfig {
  address: string;
  privateKey: string;
}

/**
 * Environment options
 */
export interface EnvironmentOptions {
  compilerVersion?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Complete network environment configuration
 */
export interface NetworkEnvironment {
  network: NetworkConfig;
  account: AccountConfig;
  options?: EnvironmentOptions;
}