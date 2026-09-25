# Product Proposal

**Provided idea selected:** Confidential Credentials

## What is the product, and who uses it?

VeilPass is a privacy-preserving credential and eligibility application for universities, public agencies, communities, and benefit programs. An organization can recognize an eligible person, while that person later proves eligibility and claims a campaign benefit without publishing their identity or raw credential.

The current Level 3 product focuses on the claimant flow: a person connects Lace on Midnight Preprod, keeps a random credential secret in browser-local private state, and produces a zero-knowledge proof for a campaign. The contract records only a campaign-scoped nullifier and an aggregate claim count, which lets the program verify participation and prevent duplicate claims.

## Why Midnight specifically?

A transparent chain would force the application to publish either the credential, a stable identity identifier, or enough linkage data to follow the holder across campaigns. Midnight lets the Compact circuit consume the credential secret as a private witness while disclosing only the minimum public result needed for enforcement.

The result is a useful split between privacy and accountability: administrators can verify aggregate claims and reject reuse, while observers cannot recover the credential secret or directly link it to a person's identity.

## Data Model

| Data Point | Type | Disclosed To |
| --- | --- | --- |
| Aggregate claim count | Public ledger | Everyone |
| Campaign-specific nullifier | Public ledger | Everyone |
| Campaign identifier/hash | Public circuit input | Everyone |
| Credential secret | Private witness/local state | No one |
| Wallet-to-credential identity link | Not stored by contract | No one |
| Zero-knowledge proof result | Transaction proof | Network verifiers |

## Mainnet Feasibility

The core one-time private claim flow is already functional on Preprod and can realistically progress toward Mainnet by Level 6. Before real-world use, VeilPass must add issuer authorization, signed credential commitments, expiry and revocation rules, policy versioning, security review, and a migration plan for contract upgrades.

The Level 4–6 scope will therefore keep the simple claimant experience while introducing an issuer-approved credential model and documenting operational controls. The current contract remains an educational Preprod prototype and will not be presented as production-ready for real benefits until those controls are implemented and audited.
