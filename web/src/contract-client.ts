import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { fromHex, toHex, type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import * as VeilPass from '../../contracts/managed/veilpass/contract/index.js';
import { browserPrivateStateProvider } from './private-state-provider';

export const PRIVATE_STATE_ID = 'veilPassPrivateState' as const;
export type VeilPassPrivateState = { credentialSecret: Uint8Array };
type CircuitKey = 'claimBenefit';
type Providers = MidnightProviders<CircuitKey, typeof PRIVATE_STATE_ID, VeilPassPrivateState>;

const witnesses = {
  credentialSecret({ privateState }: { privateState: VeilPassPrivateState }): [VeilPassPrivateState, Uint8Array] {
    return [privateState, privateState.credentialSecret];
  },
};

export const compiledContract = CompiledContract.make('veilpass', VeilPass.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
);

const SECRET_KEY = 'veilpass:credential-secret:v1';

function getOrCreatePrivateState(): VeilPassPrivateState {
  const stored = localStorage.getItem(SECRET_KEY);
  if (stored) {
    return { credentialSecret: Uint8Array.from(atob(stored), (char) => char.charCodeAt(0)) };
  }
  const credentialSecret = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(SECRET_KEY, btoa(String.fromCharCode(...credentialSecret)));
  return { credentialSecret };
}

async function createProviders(connectedAPI: ConnectedAPI): Promise<Providers> {
  const networkId = (import.meta.env.VITE_NETWORK_ID || 'preprod') as NetworkId;
  setNetworkId(networkId);
  const config = await connectedAPI.getConfiguration();
  if (!config.proverServerUri) throw new Error('Lace did not provide a proof-server URL.');
  const shielded = await connectedAPI.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<CircuitKey>(window.location.origin, fetch.bind(window));

  return {
    privateStateProvider: browserPrivateStateProvider(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (transaction: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await connectedAPI.balanceUnsealedTransaction(toHex(transaction.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (transaction: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(transaction.serialize()));
        return transaction.identifiers()[0];
      },
    },
  };
}

export class VeilPassClient {
  private constructor(
    private readonly contract: Awaited<ReturnType<typeof findDeployedContract>>,
    readonly contractAddress: ContractAddress,
  ) {}

  static async join(connectedAPI: ConnectedAPI, address: string): Promise<VeilPassClient> {
    const providers = await createProviders(connectedAPI);
    const contractAddress = address as ContractAddress;
    const contract = await findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: compiledContract as any,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: getOrCreatePrivateState(),
    });
    providers.privateStateProvider.setContractAddress(contractAddress);
    return new VeilPassClient(contract, contractAddress);
  }

  async claim(campaignId: Uint8Array): Promise<void> {
    await (this.contract as any).callTx.claimBenefit(campaignId);
  }
}

export async function campaignToId(campaign: string): Promise<Uint8Array> {
  const normalized = campaign.trim().toLowerCase();
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)));
}

export function hasLocalCredential(): boolean {
  return localStorage.getItem(SECRET_KEY) !== null;
}

export function shortHex(value: string, start = 10, end = 8): string {
  return value.length <= start + end + 1 ? value : `${value.slice(0, start)}…${value.slice(-end)}`;
}
