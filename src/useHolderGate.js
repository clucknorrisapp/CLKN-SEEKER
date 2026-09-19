// src/useHolderGate.js — client orchestration for the Phase 3 holder gate.
//
// New model: CLKN payments are OFF. Premium tools unlock by HOLDING CLKN.
// This hook drives the full round-trip against lib/wallet-gate.js:
//
//   1. GET  /api/wallet/challenge?address=<pk>  → server-issued message
//   2. wallet.signMessage(challenge)            → Seed Vault / MWA prompt
//   3. POST /api/wallet/verify {pk, message, signature}
//        → server verifies ed25519 sig + reads on-chain CLKN balance
//        → { verified, isHolder, balance, threshold, unlock }
//
// The signature proves the user controls the wallet; the server-side balance
// read proves holdings. Neither can be spoofed from the client alone.
//
// Usage:
//   const gate = useHolderGate();
//   <button onClick={gate.run} disabled={gate.status === "working"}>Unlock</button>
//   {gate.unlocked && <PremiumTool />}

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// status: idle | working | unlocked | not-holder | error
export function useHolderGate() {
  const { publicKey, signMessage, connected } = useWallet();
  const [status, setStatus] = useState("idle");
  const [balance, setBalance] = useState(null);
  const [threshold, setThreshold] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    if (!connected || !publicKey || !signMessage) {
      setError("Connect a wallet first");
      setStatus("error");
      return;
    }
    try {
      setStatus("working");
      setError(null);
      const address = publicKey.toBase58();

      // 1. Ask the server for a fresh challenge.
      const challengeRes = await fetch(
        `/api/wallet/challenge?address=${encodeURIComponent(address)}`
      );
      if (!challengeRes.ok) throw new Error("Could not get challenge");
      const { challenge } = await challengeRes.json();

      // 2. Have the wallet sign it (Seed Vault prompt on the Seeker).
      const encoded = new TextEncoder().encode(challenge);
      const sigBytes = await signMessage(encoded);
      const signature = btoa(String.fromCharCode(...sigBytes));

      // 3. Server verifies signature + reads balance + decides unlock.
      const verifyRes = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: address, message: challenge, signature }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) {
        throw new Error(data.reason || "Verification failed");
      }

      setBalance(data.balance);
      setThreshold(data.threshold);
      setStatus(data.unlock ? "unlocked" : "not-holder");
    } catch (e) {
      setError(e?.message || String(e));
      setStatus("error");
    }
  }, [connected, publicKey, signMessage]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    unlocked: status === "unlocked",
    isNotHolder: status === "not-holder",
    balance,
    threshold,
    error,
    run,
    reset,
  };
}
