// On-brand Cluck Norris wallet widget for the Phase 3 Mobile Wallet Adapter
// integration. Drop this in anywhere — header, transcript page, premium
// unlock flows — and it does three things:
//
//   1) "Connect Wallet" button that triggers MWA (Seed Vault on the Seeker,
//      Phantom/Solflare/Backpack on other Android phones).
//   2) Once connected, shows the truncated address + the wallet's CLKN balance.
//   3) Demos signMessage with a "Verify wallet ownership" button — the same
//      flow you'd use to prove a wallet owns a transcript without spending SOL.
//
// Visual style matches the existing app (Oswald + #FCD34D / #D97706 gold,
// dark cards, sharp letter-spacing).

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

const CLKN_MINT = new PublicKey("DW6DF2mjtyx67vcNmMhFm9XdxAwREurorghZcS3CBAGS");
// CLKN is launched on Bags.fm; tokens minted there use 6 decimals.
const CLKN_DECIMALS = 6;

// ── Visual tokens reused from the rest of the app ─────────────────────────
const STYLE = {
  card: {
    background: "#111111",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  label: {
    fontFamily: "'Oswald',sans-serif",
    fontSize: 10,
    color: "#6B7280",
    letterSpacing: 3,
    fontWeight: 700,
  },
  buttonPrimary: {
    background: "linear-gradient(135deg, #FCD34D, #D97706)",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 10,
    padding: "12px 22px",
    fontFamily: "'Oswald',sans-serif",
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 2,
    cursor: "pointer",
  },
  buttonGhost: {
    background: "rgba(217,119,6,0.12)",
    color: "#FCD34D",
    border: "1px solid rgba(217,119,6,0.4)",
    borderRadius: 10,
    padding: "10px 18px",
    fontFamily: "'Oswald',sans-serif",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 2,
    cursor: "pointer",
  },
  buttonDisconnect: {
    background: "transparent",
    color: "#9CA3AF",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "6px 12px",
    fontFamily: "'Oswald',sans-serif",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
  },
  mono: { fontFamily: "monospace", fontSize: 11, color: "#D1D5DB" },
};

function truncateAddress(pk) {
  if (!pk) return "";
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function formatClkn(rawAmount) {
  if (rawAmount === null || rawAmount === undefined) return "—";
  const n = Number(rawAmount) / 10 ** CLKN_DECIMALS;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function WalletWidget({ compact = false }) {
  const { connection } = useConnection();
  const { publicKey, connecting, connected, disconnect, signMessage } =
    useWallet();
  const { setVisible } = useWalletModal();

  const [clknBalance, setClknBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState("idle"); // idle | signing | verified | failed
  const [verifyError, setVerifyError] = useState(null);

  // Fetch CLKN balance for the connected wallet
  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      if (!publicKey || !connection) {
        setClknBalance(null);
        return;
      }
      try {
        setBalanceLoading(true);
        const ata = await getAssociatedTokenAddress(CLKN_MINT, publicKey);
        try {
          const acct = await getAccount(connection, ata);
          if (!cancelled) setClknBalance(acct.amount.toString());
        } catch {
          // No ATA = zero CLKN held — not an error.
          if (!cancelled) setClknBalance("0");
        }
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    }
    loadBalance();
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection]);

  const handleConnect = useCallback(() => setVisible(true), [setVisible]);

  const handleVerify = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    try {
      setVerifyStatus("signing");
      setVerifyError(null);
      const nonce = Math.random().toString(36).slice(2);
      const message = `Cluck Norris wallet verification\nWallet: ${publicKey.toBase58()}\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}`;
      const encoded = new TextEncoder().encode(message);
      const sig = await signMessage(encoded);
      // In production this signature + message + nonce go to /api/verify-wallet
      // to be checked server-side with @solana/web3.js nacl.sign.detached.verify.
      console.log("[Cluck] message:", message);
      console.log(
        "[Cluck] signature (base64):",
        btoa(String.fromCharCode(...sig))
      );
      setVerifyStatus("verified");
    } catch (e) {
      setVerifyStatus("failed");
      setVerifyError(e?.message || String(e));
    }
  }, [publicKey, signMessage]);

  // Not connected → just the connect button
  if (!connected) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          ...STYLE.buttonPrimary,
          opacity: connecting ? 0.6 : 1,
          cursor: connecting ? "wait" : "pointer",
        }}
      >
        {connecting ? "CONNECTING…" : "🐔 CONNECT WALLET"}
      </button>
    );
  }

  // Compact mode (e.g. nav bar / header): just address + disconnect
  if (compact) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ ...STYLE.mono, color: "#FCD34D" }}>
          {truncateAddress(publicKey)}
        </span>
        <button onClick={disconnect} style={STYLE.buttonDisconnect}>
          DISCONNECT
        </button>
      </div>
    );
  }

  // Full mode: card with address, balance, sign-message verify demo
  return (
    <div style={STYLE.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={STYLE.label}>WALLET CONNECTED</span>
        <button onClick={disconnect} style={STYLE.buttonDisconnect}>
          DISCONNECT
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ ...STYLE.label, fontSize: 9, marginBottom: 4 }}>
          ADDRESS
        </div>
        <div style={{ ...STYLE.mono, wordBreak: "break-all", color: "#F9FAFB" }}>
          {publicKey.toBase58()}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...STYLE.label, fontSize: 9, marginBottom: 4 }}>
          CLKN BALANCE
        </div>
        <div
          style={{
            fontFamily: "'Oswald',sans-serif",
            fontSize: 22,
            fontWeight: 900,
            color: "#FCD34D",
            letterSpacing: 1,
          }}
        >
          {balanceLoading ? "…" : formatClkn(clknBalance)}{" "}
          <span style={{ fontSize: 12, color: "#9CA3AF", letterSpacing: 3 }}>
            CLKN
          </span>
        </div>
      </div>

      <div>
        <button
          onClick={handleVerify}
          disabled={verifyStatus === "signing"}
          style={{
            ...STYLE.buttonGhost,
            opacity: verifyStatus === "signing" ? 0.6 : 1,
            cursor: verifyStatus === "signing" ? "wait" : "pointer",
          }}
        >
          {verifyStatus === "signing"
            ? "AWAITING WALLET…"
            : verifyStatus === "verified"
            ? "✓ VERIFIED — SIGNATURE IN CONSOLE"
            : verifyStatus === "failed"
            ? "✗ VERIFICATION FAILED — RETRY"
            : "VERIFY WALLET OWNERSHIP"}
        </button>
        {verifyStatus === "failed" && verifyError && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#EF4444",
              lineHeight: 1.5,
            }}
          >
            {verifyError}
          </div>
        )}
        {verifyStatus === "verified" && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#9CA3AF",
              lineHeight: 1.5,
            }}
          >
            Server would now POST the signed message to{" "}
            <code style={{ color: "#FCD34D" }}>/api/verify-wallet</code> and
            confirm ownership server-side. Spends zero SOL.
          </div>
        )}
      </div>
    </div>
  );
}
