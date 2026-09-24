import { randomBytes } from 'node:crypto';

export type VeilPassPrivateState = {
  credentialSecret: Uint8Array;
};

export function createInitialPrivateState(): VeilPassPrivateState {
  return { credentialSecret: randomBytes(32) };
}

export const witnesses = {
  credentialSecret({ privateState }: { privateState: VeilPassPrivateState }): [VeilPassPrivateState, Uint8Array] {
    return [privateState, privateState.credentialSecret];
  },
};
