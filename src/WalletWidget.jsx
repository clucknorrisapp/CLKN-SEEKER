// On-brand Cluck Norris wallet widget for the Phase 3 Mobile Wallet Adapter
// integration. Drop this in anywhere — header, transcript page, premium
// unlock flows — and it does three things:
//
//   1) "Connect Wallet" button that triggers MWA (Seed Vault on the Seeker,
//      Phantom/Solflare/Backpack on other Android phones).
//   2) Once connected, shows the truncated address + the wallet's CLKN balance.
//   3) A holder gate: "Unlock Holder Access" runs the sign→verify→balance
//      round-trip (useHolderGate) — the server proves ownership + checks the
//      on-chain CLKN balance and unlocks premium tools for CLKN holders.
//      (CLKN payments are offline; holding CLKN is now how you unlock.)
//
// Visual style matches the existing app (Oswald + #FCD34D / #D97706 gold,
// dark cards, sharp letter-spacing).

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useHolderGate } from "./useHolderGate.js";

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
  const gate = useHolderGate(); // sign → verify → on-chain balance → unlock

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

  // Holder-gate flow lives in useHolderGate() (challenge → sign → verify →
  // on-chain balance → unlock). `gate.run` triggers it; `gate.status` drives UI.

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
          onClick={gate.run}
          disabled={gate.status === "working"}
          style={{
            ...STYLE.buttonGhost,
            opacity: gate.status === "working" ? 0.6 : 1,
            cursor: gate.status === "working" ? "wait" : "pointer",
          }}
        >
          {gate.status === "working"
            ? "AWAITING WALLET…"
            : gate.status === "unlocked"
            ? "✓ HOLDER ACCESS UNLOCKED"
            : gate.status === "not-holder"
            ? "↻ RE-CHECK HOLDER STATUS"
            : gate.status === "error"
            ? "✗ VERIFICATION FAILED — RETRY"
            : "🔓 UNLOCK HOLDER ACCESS"}
        </button>

        {gate.status === "error" && gate.error && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#EF4444", lineHeight: 1.5 }}>
            {gate.error}
          </div>
        )}

        {gate.status === "unlocked" && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#6EE7B7", lineHeight: 1.5 }}>
            Wallet verified on-chain and holds{" "}
            <strong>{formatClkn(String(Math.round(gate.balance * 10 ** CLKN_DECIMALS)))}</strong>{" "}
            CLKN (≥ {gate.threshold?.toLocaleString()}). Premium tools unlocked
            for this session — no payment required.
          </div>
        )}

        {gate.status === "not-holder" && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
            Verified — but this wallet holds{" "}
            <strong style={{ color: "#FCD34D" }}>
              {gate.balance?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>{" "}
            CLKN, below the {gate.threshold?.toLocaleString()} holder threshold.
            The full school and free tools remain available to everyone.
          </div>
        )}
      </div>
    </div>
  );
}
