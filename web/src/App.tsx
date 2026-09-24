import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import semver from 'semver';
import { campaignToId, hasLocalCredential, shortHex, VeilPassClient } from './contract-client';
import { useContractState } from './use-contract-state';

type WalletStatus = 'detecting' | 'missing' | 'ready' | 'connecting' | 'connected';
type ClaimStatus = 'idle' | 'deploying' | 'joining' | 'proving' | 'submitted' | 'error';

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID || 'preprod';
const DEFAULT_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || '';

function findCompatibleWallet(): InitialAPI | undefined {
  return Object.values(window.midnight ?? {}).find(
    (wallet) => wallet && typeof wallet === 'object' && semver.satisfies(wallet.apiVersion, '4.x'),
  );
}

function friendlyError(caught: unknown): string {
  const error = caught as { message?: string; cause?: { message?: string; failure?: { message?: string } } };
  const message = error?.message || error?.cause?.failure?.message || error?.cause?.message || String(caught);
  if (/user rejected|cancel/i.test(message)) return 'The request was cancelled in Lace.';
  if (/already claimed|Benefit already claimed/i.test(message)) return 'This private credential has already claimed this campaign.';
  if (/proof server|failed to fetch/i.test(message)) return 'The proof server is unavailable. Check the Lace Preprod configuration.';
  if (/insufficient|dust/i.test(message)) return 'The wallet needs more tNIGHT/DUST for transaction fees.';
  if (/network/i.test(message)) return 'Lace and VeilPass must both use the Preprod network.';
  return message || 'An unexpected error occurred.';
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 20 5v6c0 5.2-3.3 9.5-8 11-4.7-1.5-8-5.8-8-11V5l8-3Z" />
      <path d="m8.7 12 2.1 2.1 4.7-5" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v2H6a2 2 0 0 0 0 4h14v5a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-10Z" />
      <path d="M16 8h5v6h-5a3 3 0 1 1 0-6Z" />
    </svg>
  );
}

export default function App() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('detecting');
  const [walletAPI, setWalletAPI] = useState<InitialAPI>();
  const [connectedAPI, setConnectedAPI] = useState<ConnectedAPI>();
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [contractDraft, setContractDraft] = useState(DEFAULT_CONTRACT);
  const [campaign, setCampaign] = useState('student-support-2026');
  const [campaignHash, setCampaignHash] = useState('');
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [credentialPresent, setCredentialPresent] = useState(hasLocalCredential());
  const publicState = useContractState(contractAddress);

  useEffect(() => {
    const found = findCompatibleWallet();
    if (found) {
      setWalletAPI(found);
      setWalletStatus('ready');
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const candidate = findCompatibleWallet();
      if (candidate) {
        setWalletAPI(candidate);
        setWalletStatus('ready');
        window.clearInterval(timer);
      } else if (attempts >= 20) {
        setWalletStatus('missing');
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void campaignToId(campaign).then((id) => {
      if (active) setCampaignHash(Array.from(id, (byte) => byte.toString(16).padStart(2, '0')).join(''));
    });
    return () => { active = false; };
  }, [campaign]);

  const connect = useCallback(async () => {
    if (!walletAPI) return;
    setWalletStatus('connecting');
    setNotice(null);
    try {
      const connection = await walletAPI.connect(NETWORK_ID);
      const { unshieldedAddress } = await connection.getUnshieldedAddress();
      setConnectedAPI(connection);
      setWalletAddress(unshieldedAddress);
      setWalletStatus('connected');
    } catch (caught) {
      setNotice(friendlyError(caught));
      setWalletStatus('ready');
    }
  }, [walletAPI]);

  const disconnect = useCallback(() => {
    setConnectedAPI(undefined);
    setWalletAddress('');
    setWalletStatus(walletAPI ? 'ready' : 'missing');
    setClaimStatus('idle');
    setNotice('VeilPass disconnected locally. Lace permissions can also be revoked from the wallet.');
  }, [walletAPI]);

  const applyContract = useCallback(() => {
    const value = contractDraft.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(value)) {
      setNotice('A Preprod contract address must contain exactly 64 hexadecimal characters.');
      return;
    }
    setContractAddress(value);
    setNotice(null);
  }, [contractDraft]);

  const deployNewContract = useCallback(async () => {
    if (!connectedAPI) {
      setNotice('Connect Lace before deploying a Preprod contract.');
      return;
    }
    setNotice(null);
    setClaimStatus('deploying');
    try {
      const client = await VeilPassClient.deploy(connectedAPI);
      const address = client.contractAddress;
      setContractAddress(address);
      setContractDraft(address);
      setCredentialPresent(true);
      setClaimStatus('idle');
      setNotice(`Contract deployed on Preprod: ${address}`);
    } catch (caught) {
      setClaimStatus('error');
      setNotice(friendlyError(caught));
    }
  }, [connectedAPI]);

  const claim = useCallback(async () => {
    if (!connectedAPI) {
      setNotice('Connect Lace before creating a private claim.');
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(contractAddress)) {
      setNotice('Set a valid Preprod contract address first.');
      return;
    }
    if (!campaign.trim()) {
      setNotice('Enter a campaign identifier.');
      return;
    }

    setNotice(null);
    setClaimStatus('joining');
    try {
      const client = await VeilPassClient.join(connectedAPI, contractAddress);
      setCredentialPresent(true);
      setClaimStatus('proving');
      await client.claim(await campaignToId(campaign));
      setClaimStatus('submitted');
      setNotice('Claim accepted. The public counter changed; your credential secret stayed in this browser.');
      window.setTimeout(() => void publicState.refresh(), 3_000);
    } catch (caught) {
      setClaimStatus('error');
      setNotice(friendlyError(caught));
    }
  }, [campaign, connectedAPI, contractAddress, publicState]);

  const progressLabel = useMemo(() => {
    if (claimStatus === 'deploying') return 'Deploying contract…';
    if (claimStatus === 'joining') return 'Joining contract…';
    if (claimStatus === 'proving') return 'Generating zero-knowledge proof…';
    if (claimStatus === 'submitted') return 'Claim submitted';
    return 'Prove & claim benefit';
  }, [claimStatus]);

  const busy = claimStatus === 'deploying' || claimStatus === 'joining' || claimStatus === 'proving';
  const isConnected = walletStatus === 'connected';

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="nav container">
        <a className="brand" href="#top" aria-label="VeilPass home">
          <span className="brand-mark"><IconShield /></span>
          <span>VeilPass</span>
        </a>
        <div className="nav-meta">
          <span className="network-pill"><i /> Midnight Preprod</span>
          {isConnected ? (
            <button className="wallet-chip" onClick={disconnect} title="Disconnect wallet">
              <IconWallet /> {shortHex(walletAddress, 11, 6)} <span>Disconnect</span>
            </button>
          ) : walletStatus === 'missing' ? (
            <a className="button button-secondary compact" href="https://www.lace.io/" target="_blank" rel="noreferrer">
              Install Lace
            </a>
          ) : (
            <button className="button button-primary compact" onClick={connect} disabled={walletStatus !== 'ready'}>
              <IconWallet /> {walletStatus === 'connecting' || walletStatus === 'detecting' ? 'Detecting…' : 'Connect Lace'}
            </button>
          )}
        </div>
      </nav>

      <main id="top" className="container main-grid">
        <section className="hero">
          <div className="eyebrow"><span>Zero-knowledge eligibility</span><i /></div>
          <h1>Prove you qualify.<br /><em>Reveal nothing else.</em></h1>
          <p className="hero-copy">
            VeilPass lets a person claim a one-time benefit using a private credential. Midnight verifies the proof while identity and credential data remain local.
          </p>
          <div className="privacy-row">
            <div><span className="check">✓</span><p><strong>Private by design</strong><small>Credential never leaves your device</small></p></div>
            <div><span className="check">✓</span><p><strong>Publicly verifiable</strong><small>Claims settle on Preprod</small></p></div>
          </div>
        </section>

        <section className="claim-card" aria-label="Private benefit claim">
          <div className="card-head">
            <div>
              <span className="step-label">PRIVATE ACTION</span>
              <h2>Claim a benefit</h2>
            </div>
            <span className={`status-dot ${isConnected ? 'online' : ''}`}>{isConnected ? 'Wallet ready' : 'Wallet offline'}</span>
          </div>

          <label className="field-label" htmlFor="campaign">Campaign identifier</label>
          <div className="input-wrap">
            <input id="campaign" value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="e.g. student-support-2026" />
            <span>SHA-256</span>
          </div>
          <p className="hash-preview">Campaign hash <code>{campaignHash ? shortHex(campaignHash, 18, 12) : '—'}</code></p>

          <div className="secret-panel">
            <span className="secret-icon">•••</span>
            <div>
              <strong>Private credential</strong>
              <small>{credentialPresent ? 'Stored locally · never disclosed' : 'Created locally on first claim'}</small>
            </div>
            <span className="lock">LOCAL</span>
          </div>

          <button className="button button-primary claim-button" onClick={claim} disabled={busy || !isConnected}>
            {busy && <span className="spinner" />}{progressLabel}
          </button>
          {!isConnected && <button className="connect-hint" onClick={connect} disabled={walletStatus !== 'ready'}>Connect Lace to continue →</button>}
          <div className="proof-note"><IconShield /><span>Only a campaign-specific nullifier and the claim count become public.</span></div>
        </section>
      </main>

      {notice && (
        <div className={`toast ${claimStatus === 'error' ? 'toast-error' : ''}`} role="status">
          <span>{claimStatus === 'error' ? '!' : '✓'}</span>{notice}<button onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <section className="container evidence-grid">
        <article className="state-card">
          <div className="section-title"><span>01</span><div><h3>Public state</h3><p>Visible and verifiable on Midnight</p></div></div>
          <div className="metric-row">
            <div><small>TOTAL CLAIMS</small><strong>{publicState.loading ? '…' : publicState.totalClaims}</strong></div>
            <div><small>USED NULLIFIERS</small><strong>{publicState.loading ? '…' : publicState.uniqueNullifiers}</strong></div>
          </div>
          <div className="contract-control">
            <label htmlFor="contract">Preprod contract</label>
            <div><input id="contract" value={contractDraft} onChange={(event) => setContractDraft(event.target.value)} placeholder="64-character contract address" /><button onClick={applyContract}>Load</button></div>
            <button className="deploy-button" onClick={deployNewContract} disabled={!isConnected || busy}>
              {claimStatus === 'deploying' ? 'Deploying with Lace…' : 'Deploy a new Preprod contract with Lace'}
            </button>
            {contractAddress && <code>{shortHex(contractAddress, 22, 16)}</code>}
            {publicState.error && <p className="inline-error">{publicState.error}</p>}
          </div>
        </article>

        <article className="privacy-card">
          <div className="section-title"><span>02</span><div><h3>What stays private</h3><p>The proof reveals the minimum</p></div></div>
          <ul className="privacy-list">
            <li><span>Credential secret</span><b>LOCAL ONLY</b></li>
            <li><span>Wallet identity in credential</span><b>NOT DISCLOSED</b></li>
            <li><span>Eligibility proof</span><b>ZERO KNOWLEDGE</b></li>
          </ul>
          <p className="privacy-explainer">The circuit derives a campaign-specific nullifier from a private secret. It proves eligibility and prevents a duplicate claim without publishing the secret itself.</p>
        </article>
      </section>

      <section className="container flow-section">
        <p className="flow-kicker">HOW THE CLAIM WORKS</p>
        <div className="flow">
          <div><span>1</span><strong>Connect Lace</strong><small>Authorize Preprod</small></div>
          <i />
          <div><span>2</span><strong>Create proof</strong><small>Secret stays local</small></div>
          <i />
          <div><span>3</span><strong>Verify on-chain</strong><small>Nullifier blocks duplicates</small></div>
        </div>
      </section>

      <footer className="container footer">
        <span>VeilPass · Built on Midnight</span>
        <span>Privacy is a feature, not a promise.</span>
      </footer>
    </div>
  );
}
