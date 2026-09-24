import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

const PREFIX = 'veilpass:private-state:v1';

const bytesReplacer = (_key: string, value: unknown) =>
  value instanceof Uint8Array ? { __type: 'Uint8Array', data: Array.from(value) } : value;

const bytesReviver = (_key: string, value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as { __type: string }).__type === 'Uint8Array'
  ) {
    return Uint8Array.from((value as unknown as { data: number[] }).data);
  }
  return value;
};

const encode = (value: unknown): string => JSON.stringify(value, bytesReplacer);
const decode = <T>(value: string): T => JSON.parse(value, bytesReviver) as T;

/**
 * Browser private-state provider backed by localStorage.
 * The credential secret never enters React state, a request, or the ledger.
 */
export const browserPrivateStateProvider = <PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> => {
  let contractAddress: ContractAddress | null = null;
  const signingKeys = new Map<ContractAddress, SigningKey>();

  const requireAddress = (): ContractAddress => {
    if (!contractAddress) throw new Error('Contract address has not been selected.');
    return contractAddress;
  };

  const stateKey = (id: PSI): string => `${PREFIX}:${requireAddress()}:${String(id)}`;

  return {
    setContractAddress(address): void {
      contractAddress = address;
    },
    async set(id, state): Promise<void> {
      localStorage.setItem(stateKey(id), encode(state));
    },
    async get(id): Promise<PS | null> {
      const stored = localStorage.getItem(stateKey(id));
      return stored ? decode<PS>(stored) : null;
    },
    async remove(id): Promise<void> {
      localStorage.removeItem(stateKey(id));
    },
    async clear(): Promise<void> {
      const prefix = `${PREFIX}:${requireAddress()}:`;
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    },
    async setSigningKey(address, key): Promise<void> {
      signingKeys.set(address, key);
    },
    async getSigningKey(address): Promise<SigningKey | null> {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address): Promise<void> {
      signingKeys.delete(address);
    },
    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
    },
    async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const address = requireAddress();
      const states: Record<string, string> = {};
      const prefix = `${PREFIX}:${address}:`;
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) states[key.slice(prefix.length)] = localStorage.getItem(key)!;
      }
      return {
        format: 'midnight-private-state-export',
        encryptedPayload: encode({ contractAddress: address, states }),
        salt: 'browser-local-only',
      };
    },
    async importPrivateStates(
      exported,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const payload = decode<{ states?: Record<string, string> }>(exported.encryptedPayload);
      const strategy = options?.conflictStrategy ?? 'error';
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [id, serialized] of Object.entries(payload.states ?? {})) {
        const key = stateKey(id as PSI);
        if (localStorage.getItem(key) !== null) {
          if (strategy === 'skip') { skipped += 1; continue; }
          if (strategy === 'error') throw new Error(`Private-state conflict: ${id}`);
          overwritten += 1;
        } else {
          imported += 1;
        }
        localStorage.setItem(key, serialized);
      }
      return { imported, skipped, overwritten };
    },
    async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      return {
        format: 'midnight-signing-key-export',
        encryptedPayload: encode({ keys: Object.fromEntries(signingKeys) }),
        salt: 'browser-session-only',
      };
    },
    async importSigningKeys(
      exported,
      options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      const payload = decode<{ keys?: Record<string, SigningKey> }>(exported.encryptedPayload);
      const strategy = options?.conflictStrategy ?? 'error';
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [address, key] of Object.entries(payload.keys ?? {})) {
        const typedAddress = address as ContractAddress;
        if (signingKeys.has(typedAddress)) {
          if (strategy === 'skip') { skipped += 1; continue; }
          if (strategy === 'error') throw new Error(`Signing-key conflict: ${address}`);
          overwritten += 1;
        } else {
          imported += 1;
        }
        signingKeys.set(typedAddress, key);
      }
      return { imported, skipped, overwritten };
    },
  };
};
