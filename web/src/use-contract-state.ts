import { useCallback, useEffect, useState } from 'react';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import * as VeilPass from '../../contracts/managed/veilpass/contract/index.js';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;
const QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) { state }
  }
`;

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

export type PublicContractState = {
  totalClaims: number;
  uniqueNullifiers: number;
};

export function useContractState(contractAddress: string) {
  const [state, setState] = useState<PublicContractState>({ totalClaims: 0, uniqueNullifiers: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!/^[0-9a-fA-F]{64}$/.test(contractAddress)) return;
    setLoading(true);
    try {
      const response = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { address: contractAddress } }),
      });
      const result = await response.json();
      if (!response.ok || result.errors) throw new Error(result.errors?.[0]?.message ?? 'Indexer query failed.');
      const stateHex = result.data?.contractAction?.state;
      if (!stateHex) throw new Error('Contract not found on Preprod yet.');
      const ledger = VeilPass.ledger(ContractState.deserialize(hexToBytes(stateHex)).data);
      setState({ totalClaims: Number(ledger.totalClaims), uniqueNullifiers: Number(ledger.usedNullifiers.size()) });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the contract.');
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    void refresh();
    if (!contractAddress) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [contractAddress, refresh]);

  return { ...state, loading, error, refresh };
}
