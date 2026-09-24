import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pureCircuits } from '../contracts/managed/veilpass/contract/index.js';
import { witnesses, type VeilPassPrivateState } from '../src/witnesses.js';

describe('VeilPass privacy primitives', () => {
  it('creates a deterministic credential commitment', () => {
    const secret = new Uint8Array(32).fill(7);

    assert.deepEqual(
      pureCircuits.credentialCommitment(secret),
      pureCircuits.credentialCommitment(secret),
    );
  });

  it('creates different commitments for different secrets', () => {
    const first = pureCircuits.credentialCommitment(new Uint8Array(32).fill(1));
    const second = pureCircuits.credentialCommitment(new Uint8Array(32).fill(2));

    assert.notDeepEqual(first, second);
  });

  it('keeps the credential secret in private state', () => {
    const privateState: VeilPassPrivateState = {
      credentialSecret: new Uint8Array(32).fill(42),
    };
    const [nextPrivateState, secret] = witnesses.credentialSecret({ privateState });

    assert.strictEqual(nextPrivateState, privateState);
    assert.strictEqual(secret, privateState.credentialSecret);
  });
});
