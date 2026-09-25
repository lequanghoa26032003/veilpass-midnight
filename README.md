# VeilPass

[![CI](https://github.com/lequanghoa26032003/veilpass-midnight/actions/workflows/ci.yml/badge.svg)](https://github.com/lequanghoa26032003/veilpass-midnight/actions/workflows/ci.yml)

**Confidential credentials with one-time, publicly verifiable claims on Midnight.**

VeilPass is a polished Level 3 Midnight dApp. A holder proves possession of a private credential and claims a campaign benefit without publishing the credential, wallet identity, or underlying secret. The public ledger learns only an opaque campaign-specific nullifier and the aggregate claim count.

## Live demo

- Application: [veilpass-midnight.vercel.app](https://veilpass-midnight.vercel.app/)
- Demo video: [GitHub Release v1.0.0-demo](https://github.com/lequanghoa26032003/veilpass-midnight/releases/tag/v1.0.0-demo)
- Network: **Midnight Preprod**
- Wallet: **Lace DApp Connector API 4.x**

## Contract addresses

| Network | Contract address |
| --- | --- |
| Preprod | `c1cf70c76650b96025d4198a70c15ddba07e7963bf8a4b942804f26501c180af` |
| Preview | `b68c6d615e01f837891381fe6faf840e258a597b3e8e6de722c4f88fd858b33d` |

## What VeilPass does

1. Connects and disconnects Lace on Midnight Preprod.
2. Creates a random 32-byte credential secret in the browser and stores it locally.
3. Hashes a human-readable campaign identifier to a fixed 32-byte campaign ID.
4. Calls the `claimBenefit` Compact circuit through Midnight.js and Lace.
5. Derives a campaign-specific nullifier inside the zero-knowledge circuit.
6. Rejects a second claim made with the same credential for the same campaign.
7. Displays the public aggregate claim and used-nullifier counts.

## Privacy model

### PUBLIC

- the deployed contract address and network;
- an opaque campaign-specific nullifier for each accepted claim;
- the aggregate `totalClaims` counter;
- the number of used nullifiers;
- normal transaction metadata required by Midnight.

### PRIVATE

- the raw credential secret;
- the credential holder's identity inside the credential;
- any future issuer metadata or eligibility attributes;
- the local private-state value used while constructing the proof.

### PROVED

- the claimant possesses the private credential secret required by the circuit;
- the claim derives the correct nullifier for that credential and campaign;
- the nullifier has not previously been used for this campaign;
- the public state transition is valid without revealing the secret.

An observer can verify that an accepted claim changed the public counter and consumed a unique nullifier. The observer cannot recover the credential secret from that nullifier or learn the private identity represented by the credential. Claims in different campaigns use different nullifiers, reducing cross-campaign linkability.

## Contract design

The Compact contract exposes:

- `credentialCommitment(secret)`: derives a deterministic commitment from a 32-byte credential secret.
- `claimBenefit(campaignId)`: obtains `credentialSecret()` as a private witness, derives and discloses only a campaign-specific nullifier, rejects reuse, and increments `totalClaims`.

`credentialSecret()` is implemented by the application and never written to the public ledger. The contract deliberately calls `disclose()` only on the derived nullifier, not on the secret.

## Tech stack

- Compact language `0.23` / Compact toolchain `0.31.1`
- Midnight runtime `0.16.0`
- Midnight.js `4.1.1`
- React 19, TypeScript and Vite
- Lace wallet DApp Connector API `4.x`
- Vitest for contract, state-transition and privacy tests
- GitHub Actions for compile, test and production-build checks
- Vercel for the live frontend

## Prerequisites

- Node.js 22
- npm
- Compact compiler/toolchain `0.31.1`
- Docker Desktop with WSL integration for the local proof server
- Lace wallet configured for Midnight Preprod

## Setup and run locally

```bash
git clone https://github.com/lequanghoa26032003/veilpass-midnight.git
cd veilpass-midnight
npm ci
npm --prefix web ci
npm run compile
npm test
npm run build
npm run web:build
npm run web:dev
```

Open the Vite URL, unlock Lace, choose Preprod and connect the wallet. Sending transactions requires the local Midnight proof server on port `6300`:

```bash
npm run proof-server:start
docker ps --filter "publish=6300"
```

## Tests

Run the full test suite:

```bash
npm test
```

The suite contains **7 tests** covering:

- deterministic credential commitments and campaign separation;
- private witness behavior;
- empty initial ledger state;
- successful `claimBenefit` state transition;
- duplicate-claim rejection;
- proof transcript privacy: the raw secret is present only in private transcript output and absent from public inputs and public transcript output.

## CI/CD

The workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on every pull request. It uses Node.js 22 and Midnight's official Compact setup action, then performs:

1. deterministic dependency installation;
2. Compact contract compilation;
3. all Vitest tests;
4. root TypeScript build;
5. production frontend build.

The badge beneath the title links to the latest workflow runs.

## Product proposal

The selected Level 3 idea is **Confidential Credentials**. The product scope, users, Midnight rationale, public/private data model and mainnet feasibility are documented in [PROPOSAL.md](PROPOSAL.md).

## Deploy

```bash
# Preview
npm run setup -- --network preview

# Preprod
npm run setup -- --network preprod
```

The deployment state and wallet recovery material are kept in gitignored local files. Never commit `.midnight-state.json`, `.midnight-wallet-state/`, a seed or a recovery phrase.

## Verification evidence

### Compact compilation

![Compact compiler output listing the claimBenefit circuit](docs/screenshots/compile-success.png)

### Preview deployment

![E2E verification showing the Preview contract address](docs/screenshots/preview-deployment.png)

### Successful Preprod circuit call

The public claim and nullifier counters advance while the credential remains local and undisclosed.

![Successful Preprod claim with public counters updated and private credential retained locally](docs/screenshots/preprod-claim-success.png)

## Level 3 demo checklist

Record one continuous clip of at most one minute showing:

1. the live Preprod app and Lace wallet connection;
2. a fresh campaign identifier and the `LOCAL` credential indicator;
3. `Prove & claim benefit`, proof generation and Lace transaction signing;
4. the accepted claim and updated public counters;
5. `npm test` with 7 passing tests;
6. the green GitHub Actions workflow or CI badge.

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run compile` | Compile Compact and regenerate circuit artifacts |
| `npm test` | Run all contract, transition and privacy tests |
| `npm run build` | Strict root TypeScript check |
| `npm run web:build` | Type-check and build the production frontend |
| `npm run web:dev` | Start the React frontend |
| `npm run proof-server:start` | Start the local proof server stack |
| `npm run setup -- --network preview` | Compile and deploy to Preview |
| `npm run setup -- --network preprod` | Compile and deploy to Preprod |
| `npm run test:e2e` | Reconnect to a deployment and read indexed state |

## Repository structure

```text
.github/workflows/ci.yml          Compile, test and build CI pipeline
contracts/veilpass.compact       Compact contract source
contracts/managed/veilpass/      Generated circuit, keys and bindings
src/witnesses.ts                 Private-state type and witness implementation
src/deploy.ts                    Preview/Preprod deployment
tests/veilpass.test.ts           Contract, state transition and privacy tests
web/src/App.tsx                  Polished Lace-connected user interface
web/src/contract-client.ts       Midnight browser providers and circuit call
web/src/private-state-provider.ts Browser-local credential/private state
PROPOSAL.md                      Level 3 product proposal
```

## Security scope

VeilPass is an educational testnet prototype. Production use requires authenticated issuers, commitment registration, revocation and expiry, policy versioning, secure key management, independent audits and a complete threat-model review.
