"use client";

import { useWallet } from "@/components/wallet/WalletProvider";
import { shortenAddress } from "@/lib/utils";

type Props = {
  /**
   * If true, render nothing when a wallet is connected. The Circles host UI
   * already shows the connected address, so duplicating it in our header is
   * noise.
   */
  onlyWhenDisconnected?: boolean;
};

export function WalletStatus({ onlyWhenDisconnected = false }: Props) {
  const { address, isConnected } = useWallet();
  if (onlyWhenDisconnected && isConnected) return null;
  if (!address) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
        <span
          className="inline-block size-1.5 rounded-full bg-ink-muted/40"
          aria-hidden
        />
        Not connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px]">
      <span
        className={
          "inline-block size-1.5 rounded-full " +
          (isConnected ? "bg-emerald-500" : "bg-ink-muted/40")
        }
        aria-hidden
      />
      {shortenAddress(address)}
    </span>
  );
}
