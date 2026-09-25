import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger,
  pureCircuits,
} from '../contracts/managed/veilpass/contract/index.js';
import { witnesses, type VeilPassPrivateState } from '../src/witnesses.js';

const secret = new Uint8Array(32).fill(7);
const campaign = new Uint8Array(32).fill(9);

function createContractHarness() {
  const privateState: VeilPassPrivateState = { credentialSecret: secret };
  const contract = new Contract(witnesses);
  const initial = contract.initialState(
    createConstructorContext(privateState, new Uint8Array(32)),
  );
  const context = createCircuitContext(
    dummyContractAddress(),
    initial.currentZswapLocalState,
    initial.currentContractState.data,
    privateState,
  );

  return { contract, context, initial, privateState };
}

function containsBytes(value: unknown, expected: Uint8Array): boolean {
  if (value instanceof Uint8Array) return Buffer.from(value).equals(Buffer.from(expected));
  if (Array.isArray(value)) return value.some((entry) => containsBytes(entry, expected));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => containsBytes(entry, expected));
  }
  return false;
}

describe('VeilPass privacy primitives', () => {
  it('creates a deterministic credential commitment', () => {
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

describe('VeilPass generated contract', () => {
  it('starts with an empty public claim ledger', () => {
    const { initial } = createContractHarness();
    const publicState = ledger(initial.currentContractState.data);

    assert.equal(publicState.totalClaims, 0n);
    assert.equal(publicState.usedNullifiers.size(), 0n);
  });

  it('increments the public counter and records one nullifier after a claim', () => {
    const { contract, context } = createContractHarness();
    const claimed = contract.circuits.claimBenefit(context, campaign);
    const publicState = ledger(claimed.context.currentQueryContext.state);

    assert.equal(publicState.totalClaims, 1n);
    assert.equal(publicState.usedNullifiers.size(), 1n);
  });

  it('rejects a duplicate claim for the same credential and campaign', () => {
    const { contract, context } = createContractHarness();
    const firstClaim = contract.circuits.claimBenefit(context, campaign);

    assert.throws(
      () => contract.circuits.claimBenefit(firstClaim.context, campaign),
      /Benefit already claimed/,
    );
  });

  it('keeps the credential secret out of public circuit data', () => {
    const { contract, context } = createContractHarness();
    const claimed = contract.circuits.claimBenefit(context, campaign);

    assert.equal(containsBytes(claimed.proofData.privateTranscriptOutputs, secret), true);
    assert.equal(containsBytes(claimed.proofData.publicTranscript, secret), false);
    assert.equal(containsBytes(claimed.proofData.input, secret), false);
  });
});
