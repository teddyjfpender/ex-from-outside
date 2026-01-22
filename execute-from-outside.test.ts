import { describe, it, expect, beforeAll } from 'bun:test';
import { RpcProvider, Contract, Account, cairo, type OutsideExecutionOptions, type OutsideTransaction, type Call, outsideExecution, ec, hash, CallData } from 'starknet';
import { DEVNET_CONFIG } from './devnet-data'

// run 'starknet-devnet --accounts 10 --seed 0 --account-class-custom ./ArgentAccount.json' to use the local devnet
// note: addresses and values are fixed to devnet instance
//
// IMPORTANT: Execute From Outside (SNIP-9) requires accounts that implement
// the SNIP-9 interface (execute_from_outside entrypoint). When using Argent accounts
// with devnet, the accounts must be properly initialized with their owner public keys.

/**
 * Helper to deploy a properly initialized Argent account
 */
async function deployArgentAccount(
  provider: RpcProvider,
  privateKey: string,
  classHash: string
): Promise<{ account: Account; address: string }> {
  // Derive public key from private key
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  // Construct the constructor calldata for Argent account
  // owner: Signer enum - variant 0 (Starknet) with StarknetSigner struct containing pubkey
  // guardian: Option<Signer> - variant 1 (None)
  // Format: [owner_variant_idx, owner_pubkey, guardian_variant_idx]
  const constructorCalldata = [
    '0x0', // Signer::Starknet variant index
    publicKey, // StarknetSigner.pubkey
    '0x1', // Option::None variant index for guardian
  ];

  // Calculate the account address
  const accountAddress = hash.calculateContractAddressFromHash(
    publicKey, // salt
    classHash,
    constructorCalldata,
    0
  );

  // Check if account is already deployed
  try {
    const classHashAtAddress = await provider.getClassHashAt(accountAddress);
    if (classHashAtAddress) {
      console.log(`Account already deployed at ${accountAddress}`);
      // Account exists, just return it
      const account = new Account({
        provider,
        address: accountAddress,
        signer: privateKey
      });
      return { account, address: accountAddress };
    }
  } catch (e) {
    // Account not deployed, continue with deployment
  }

  // Fund the account using devnet's RPC mint method
  const mintResponse = await fetch(`${DEVNET_CONFIG.rpcUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'devnet_mint',
      params: {
        address: accountAddress,
        amount: 1000000000000000000000 // 1000 STRK in FRI
      },
      id: 1
    })
  });
  const mintResult = await mintResponse.json();
  if (mintResult.error) {
    throw new Error(`Failed to mint: ${JSON.stringify(mintResult.error)}`);
  }
  console.log(`Funded account ${accountAddress} with 1000 STRK`);

  // Create account instance for deployment
  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey
  });

  // Deploy the account
  const deployPayload = {
    classHash,
    constructorCalldata,
    addressSalt: publicKey
  };

  const { transaction_hash } = await account.deployAccount(deployPayload);
  await provider.waitForTransaction(transaction_hash);

  console.log(`Deployed Argent account at ${accountAddress}`);
  return { account, address: accountAddress };
}

describe('BatchClient', () => {
  describe('BatchClient functions', () => {
    it('should batch multiple contract calls', async () => {
      const nodeUrl = DEVNET_CONFIG.rpcUrl;
      const provider = new RpcProvider({ nodeUrl, batch: 0 });

      // Example: STRK token contract
      const strkTokenAddress = '0x04718f5a0Fc34cC1AF16A1cdee98fFB20C31f5cD61D6Ab07201858f4287c938D';
      const { abi } = await provider.getClassAt(strkTokenAddress);

      const addresses = [
        '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
        '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1',
      ];

      // Create contract instance
      const strkContract = new Contract({abi: abi, address: strkTokenAddress, providerOrAccount: provider});

      // Sequential calls (BatchClient would batch these)
      const balances = await Promise.all(
        addresses.map(async (address) => {
          const balance = await strkContract.balanceOf(address);
          return { address, balance: balance.toString() };
        })
      );

      console.log('Balances:', balances);
      expect(balances).toHaveLength(2);
    });
  });
});

describe('Execute From Outside (SNIP-9)', () => {
  const provider = new RpcProvider({ nodeUrl: DEVNET_CONFIG.rpcUrl });
  const strkTokenAddress = DEVNET_CONFIG.tokens.strk.address;

  // These will be set up in beforeAll
  let signerAccount: Account;
  let executorAccount: Account;
  let recipientAddress: string;
  let argentClassHash: string;

  beforeAll(async () => {
    // Get the Argent class hash from the pre-deployed account
    argentClassHash = await provider.getClassHashAt(DEVNET_CONFIG.accounts[0].address);
    console.log('Argent class hash:', argentClassHash);

    // Deploy properly initialized Argent accounts
    console.log('Deploying signer account...');
    const signerResult = await deployArgentAccount(
      provider,
      DEVNET_CONFIG.accounts[0].privateKey,
      argentClassHash
    );
    signerAccount = signerResult.account;

    console.log('Deploying executor account...');
    const executorResult = await deployArgentAccount(
      provider,
      DEVNET_CONFIG.accounts[1].privateKey,
      argentClassHash
    );
    executorAccount = executorResult.account;

    // Use third devnet account address as recipient (just needs to receive, doesn't need to be initialized)
    recipientAddress = DEVNET_CONFIG.accounts[2].address;
  }, 180000); // 3min timeout for deployment

  it('should check SNIP-9 version support', async () => {
    // Check if the signer account supports SNIP-9
    // Returns '0' if not supported, '1' for V1, '2' for V2
    const snip9Version = await signerAccount.getSnip9Version();
    console.log('SNIP-9 Version supported by signer account:', snip9Version);

    // Version should be '1', '2', or '0' (not supported)
    expect(['0', '1', '2']).toContain(snip9Version);

    if (snip9Version === '0') {
      console.log('Note: This account does not support SNIP-9. To use execute from outside,');
      console.log('you need an account that implements the SNIP-9 interface (e.g., Argent X v0.4.0+)');
    }
  });

  it('should demonstrate outsideExecution utility functions', () => {
    // The outsideExecution namespace provides utilities for building outside execution data
    // even without executing - useful for understanding the data structures

    // getOutsideCall converts a standard Call to OutsideCall format
    const standardCall: Call = {
      contractAddress: strkTokenAddress,
      entrypoint: 'transfer',
      calldata: [recipientAddress, '100', '0'], // low, high for uint256
    };

    const outsideCall = outsideExecution.getOutsideCall(standardCall);
    console.log('OutsideCall format:', outsideCall);

    // The OutsideCall has: to, selector, calldata
    expect(outsideCall).toHaveProperty('to');
    expect(outsideCall).toHaveProperty('selector');
    expect(outsideCall).toHaveProperty('calldata');
  });

  it('should build typed data for outside execution signing', async () => {
    // getTypedData creates the SNIP-12 typed data message for signing
    const chainId = await provider.getChainId();
    const now_seconds = Math.floor(Date.now() / 1000);

    const options: OutsideExecutionOptions = {
      caller: executorAccount.address,
      execute_after: now_seconds - 3600,
      execute_before: now_seconds + 3600,
    };

    const calls: Call[] = [{
      contractAddress: strkTokenAddress,
      entrypoint: 'transfer',
      calldata: [recipientAddress, '100', '0'],
    }];

    const nonce = '0x' + Math.floor(Math.random() * 1000000).toString(16);

    // Build typed data for SNIP-9 V2 (or V1)
    const typedData = outsideExecution.getTypedData(chainId, options, nonce, calls, '2');

    console.log('Typed data domain:', typedData.domain);
    console.log('Typed data primary type:', typedData.primaryType);

    expect(typedData.primaryType).toBe('OutsideExecution');
    expect(typedData.domain).toHaveProperty('name');
    expect(typedData.domain).toHaveProperty('chainId');
  });

  it('should create and execute an outside transaction (transfer) - requires SNIP-9 account', async () => {
    // First check if the account supports SNIP-9
    const snip9Version = await signerAccount.getSnip9Version();

    if (snip9Version === '0') {
      console.log('Skipping: Account does not support SNIP-9');
      console.log('To run this test, use an account that implements SNIP-9 (e.g., Argent X v0.4.0+)');
      return;
    }

    // Get initial balances
    const { abi } = await provider.getClassAt(strkTokenAddress);
    const strkContract = new Contract({ abi, address: strkTokenAddress, providerOrAccount: provider });

    const initialSignerBalance = await strkContract.balanceOf(signerAccount.address);
    const initialRecipientBalance = await strkContract.balanceOf(recipientAddress);

    console.log('Initial signer balance:', initialSignerBalance.toString());
    console.log('Initial recipient balance:', initialRecipientBalance.toString());

    // Define the time window for execution
    const now_seconds = Math.floor(Date.now() / 1000);
    const outsideExecutionOptions: OutsideExecutionOptions = {
      caller: executorAccount.address, // Only executor can execute this
      execute_after: now_seconds - 3600, // 1 hour ago
      execute_before: now_seconds + 3600, // 1 hour from now
    };

    // Define the call to be executed: transfer 100 FRI of STRK
    const transferAmount = cairo.uint256(100n);
    const transferCall: Call = {
      contractAddress: strkTokenAddress,
      entrypoint: 'transfer',
      calldata: [recipientAddress, transferAmount.low, transferAmount.high],
    };

    // Signer creates and signs the outside transaction
    const outsideTransaction: OutsideTransaction = await signerAccount.getOutsideTransaction(
      outsideExecutionOptions,
      transferCall
    );

    console.log('Outside transaction created:', {
      caller: outsideTransaction.outsideExecution.caller,
      nonce: outsideTransaction.outsideExecution.nonce,
      version: outsideTransaction.version,
      callsCount: outsideTransaction.outsideExecution.calls.length,
    });

    // Executor executes the outside transaction (pays the fees)
    const executeResult = await executorAccount.executeFromOutside(outsideTransaction);
    console.log('Execute from outside transaction hash:', executeResult.transaction_hash);

    // Wait for transaction to be confirmed
    await provider.waitForTransaction(executeResult.transaction_hash);

    // Verify the transfer happened
    const finalSignerBalance = await strkContract.balanceOf(signerAccount.address);
    const finalRecipientBalance = await strkContract.balanceOf(recipientAddress);

    console.log('Final signer balance:', finalSignerBalance.toString());
    console.log('Final recipient balance:', finalRecipientBalance.toString());

    // Check that signer's balance decreased by transfer amount (signer pays no fees, executor does)
    expect(BigInt(initialSignerBalance) - BigInt(finalSignerBalance)).toBe(100n);
    // Check that recipient's balance increased by transfer amount
    expect(BigInt(finalRecipientBalance) - BigInt(initialRecipientBalance)).toBe(100n);
  }, 30000); // 30s timeout

  it('should execute multiple calls in a single outside transaction - requires SNIP-9 account', async () => {
    const snip9Version = await signerAccount.getSnip9Version();

    if (snip9Version === '0') {
      console.log('Skipping: Account does not support SNIP-9');
      return;
    }

    const { abi } = await provider.getClassAt(strkTokenAddress);
    const strkContract = new Contract({ abi, address: strkTokenAddress, providerOrAccount: provider });

    const recipient2Address = DEVNET_CONFIG.accounts[3].address;

    const initialRecipient1Balance = await strkContract.balanceOf(recipientAddress);
    const initialRecipient2Balance = await strkContract.balanceOf(recipient2Address);

    const now_seconds = Math.floor(Date.now() / 1000);
    const outsideExecutionOptions: OutsideExecutionOptions = {
      caller: executorAccount.address,
      execute_after: now_seconds - 3600,
      execute_before: now_seconds + 3600,
    };

    // Multiple transfers in one outside transaction
    const amount1 = cairo.uint256(50n);
    const amount2 = cairo.uint256(75n);

    const calls: Call[] = [
      {
        contractAddress: strkTokenAddress,
        entrypoint: 'transfer',
        calldata: [recipientAddress, amount1.low, amount1.high],
      },
      {
        contractAddress: strkTokenAddress,
        entrypoint: 'transfer',
        calldata: [recipient2Address, amount2.low, amount2.high],
      },
    ];

    // Create outside transaction with multiple calls
    const outsideTransaction = await signerAccount.getOutsideTransaction(
      outsideExecutionOptions,
      calls
    );

    console.log('Multi-call outside transaction created with', outsideTransaction.outsideExecution.calls.length, 'calls');

    // Execute
    const executeResult = await executorAccount.executeFromOutside(outsideTransaction);
    await provider.waitForTransaction(executeResult.transaction_hash);

    // Verify both transfers
    const finalRecipient1Balance = await strkContract.balanceOf(recipientAddress);
    const finalRecipient2Balance = await strkContract.balanceOf(recipient2Address);

    expect(BigInt(finalRecipient1Balance) - BigInt(initialRecipient1Balance)).toBe(50n);
    expect(BigInt(finalRecipient2Balance) - BigInt(initialRecipient2Balance)).toBe(75n);

    console.log('Multi-call outside execution successful!');
  }, 30000); // 30s timeout

  it('should allow ANY_CALLER to execute when specified - requires SNIP-9 account', async () => {
    const snip9Version = await signerAccount.getSnip9Version();

    if (snip9Version === '0') {
      console.log('Skipping: Account does not support SNIP-9');
      return;
    }

    const { abi } = await provider.getClassAt(strkTokenAddress);
    const strkContract = new Contract({ abi, address: strkTokenAddress, providerOrAccount: provider });

    const initialRecipientBalance = await strkContract.balanceOf(recipientAddress);

    const now_seconds = Math.floor(Date.now() / 1000);

    // Use ANY_CALLER to allow any account to execute
    const outsideExecutionOptions: OutsideExecutionOptions = {
      caller: 'ANY_CALLER', // Special value that allows any caller
      execute_after: now_seconds - 3600,
      execute_before: now_seconds + 3600,
    };

    const transferAmount = cairo.uint256(25n);
    const transferCall: Call = {
      contractAddress: strkTokenAddress,
      entrypoint: 'transfer',
      calldata: [recipientAddress, transferAmount.low, transferAmount.high],
    };

    const outsideTransaction = await signerAccount.getOutsideTransaction(
      outsideExecutionOptions,
      transferCall
    );

    console.log('ANY_CALLER outside transaction created');

    // Any account can execute this - using executor account
    const executeResult = await executorAccount.executeFromOutside(outsideTransaction);
    await provider.waitForTransaction(executeResult.transaction_hash);

    const finalRecipientBalance = await strkContract.balanceOf(recipientAddress);
    expect(BigInt(finalRecipientBalance) - BigInt(initialRecipientBalance)).toBe(25n);

    console.log('ANY_CALLER execution successful!');
  }, 30000); // 30s timeout
});