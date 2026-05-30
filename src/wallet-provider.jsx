// Mobile Wallet Adapter (MWA) provider for the Cluck Norris React app.
//
// One-line summary of why this works WITHOUT a Capacitor plugin:
// SolanaMobileWalletAdapter handles the URI-scheme handoff to the device's
// installed Solana wallet (Seed Vault on the Seeker; Phantom/Solflare/Backpack
// on other Android phones). The OS owns the intent, so this works equally well
// inside a Capacitor WebView as it does in a regular Android browser.
//
// To use anywhere downstream, import { useWallet, useConnection } from
// '@solana/wallet-adapter-react' and call hooks normally — `publicKey`,
// `signMessage`, `sendTransaction`, etc.

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";

import "@solana/wallet-adapter-react-ui/styles.css";

// Identity the device wallet shows the user when they approve the connection.
const APP_IDENTITY = {
  name: "Cluck Norris",
  uri: "https://clucknorris.app",
  icon: "/cluck-norris.png",
};

// Mainnet. The dApp Store App NFT is on mainnet, premium payments are on
// mainnet, and the CLKN mint lives on mainnet — so the wallet should be too.
const CLUSTER = "mainnet-beta";
const ENDPOINT = clusterApiUrl(CLUSTER);

export function CluckWalletProvider({ children }) {
  const endpoint = useMemo(() => ENDPOINT, []);
  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: APP_IDENTITY,
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: CLUSTER,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
