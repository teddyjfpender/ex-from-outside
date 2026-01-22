import { describe, it, expect } from 'bun:test';
import { RpcProvider, Contract } from 'starknet';
import { DEVNET_CONFIG } from './devnet-data'

// run starknet-devnet --accounts 10 --seed 0 to use the local devent
// note: addresses and values are fixed to devnet instance

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