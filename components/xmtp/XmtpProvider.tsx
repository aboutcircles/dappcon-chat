"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useWallet } from "@/components/wallet/WalletProvider";
import type { Client } from "@xmtp/browser-sdk";

type Status =
  | { kind: "idle" }
  | { kind: "initializing" }
  | { kind: "ready"; client: Client; inboxId: string }
  | { kind: "error"; message: string };

type XmtpEnv = "dev" | "production" | "local";

type ContextValue = {
  status: Status;
  /**
   * Initialise (or re-attach to) the XMTP client for the connected wallet.
   * Triggers a SCW signMessage popup on first use; idempotent on subsequent
   * calls within the same session.
   *
   * Returns `true` if the client is ready when the promise resolves,
   * `false` otherwise (signature dismissed, Safe not deployed, network
   * error, etc.). Errors are surfaced via the `status` field — `enable`
   * itself never throws.
   */
  enable: () => Promise<boolean>;
  /** Drop the client and clear in-memory state. Does NOT clear OPFS keys. */
  disable: () => void;
};

const XmtpContext = createContext<ContextValue>({
  status: { kind: "idle" },
  enable: async () => false,
  disable: () => undefined,
});

function inboxKey(address: string): string {
  return `xmtp-inbox-${address.toLowerCase()}`;
}

function getEnv(): XmtpEnv {
  const v = process.env.NEXT_PUBLIC_XMTP_ENV;
  if (v === "dev" || v === "production" || v === "local") return v;
  // Prod URL → production, everything else → dev.
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "dmdappcon.vercel.app"
  ) {
    return "production";
  }
  return "dev";
}

export function XmtpProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Track the wallet address that the current client belongs to so we can
  // tear it down when the user switches Safes mid-session.
  const clientAddressRef = useRef<string | null>(null);

  const disable = useCallback(() => {
    clientAddressRef.current = null;
    setStatus({ kind: "idle" });
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setStatus({
        kind: "error",
        message: "No wallet — open this app from the Circles host first.",
      });
      return false;
    }
    // Already attached to the same address? Nothing to do.
    if (
      status.kind === "ready" &&
      clientAddressRef.current?.toLowerCase() === address.toLowerCase()
    ) {
      return true;
    }
    setStatus({ kind: "initializing" });
    try {
      // Dynamic imports — both packages touch `window` / WASM and must not
      // run during SSR.
      const [
        { Client, LogLevel },
        { createCirclesSafeSigner, GNOSIS_CHAIN_ID },
        miniappSdk,
      ] = await Promise.all([
        import("@xmtp/browser-sdk"),
        import("@/lib/xmtp/signer"),
        import("@aboutcircles/miniapp-sdk"),
      ]);

      const signer = createCirclesSafeSigner(
        address as `0x${string}`,
        async (message: string) => {
          // The reference passes `"erc1271"` as the second arg — Safe signs
          // via EIP-1271 and returns a hex signature with the magic value.
          const { signature } = await miniappSdk.signMessage(
            message,
            "erc1271",
          );
          return signature;
        },
        GNOSIS_CHAIN_ID,
      );

      const env = getEnv();
      const existingInbox = localStorage.getItem(inboxKey(address)) ?? undefined;

      const client = await Client.create(signer, {
        env,
        dbEncryptionKey: undefined,
        appVersion: "dappcon-chat/1",
        loggingLevel: LogLevel.Info,
      });

      // The reference calls `sendSyncRequest` post-create — for SCW it asks
      // the XMTP network to sync this installation to any prior ones.
      try {
        await client.sendSyncRequest();
      } catch (err) {
        console.warn("[xmtp] sendSyncRequest failed (non-fatal):", err);
      }

      // Persist a marker that an inbox exists for this address. The actual
      // key material lives in OPFS, managed by the XMTP SDK.
      const inboxId = client.inboxId;
      if (!inboxId) {
        throw new Error(
          "XMTP client returned without an inbox ID — initialisation failed silently.",
        );
      }
      if (!existingInbox) {
        localStorage.setItem(inboxKey(address), inboxId);
      }
      clientAddressRef.current = address;
      setStatus({ kind: "ready", client, inboxId });
      return true;
    } catch (err) {
      console.error("[xmtp] Client.create failed:", err);
      clientAddressRef.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not initialise XMTP. See console.",
      });
      return false;
    }
  }, [address, status]);

  // When the host wallet changes (or disconnects), tear down the client.
  // The user must call `enable()` again to re-attach to the new wallet.
  useEffect(() => {
    if (!address) {
      if (status.kind !== "idle") disable();
      return;
    }
    if (
      status.kind === "ready" &&
      clientAddressRef.current &&
      clientAddressRef.current.toLowerCase() !== address.toLowerCase()
    ) {
      disable();
    }
    // We don't auto-enable here — that would trigger a signMessage popup on
    // every page load. Initialisation is lazy, gated by an explicit user
    // action (see `useXmtp().enable`).
  }, [address, disable, status]);

  const value = useMemo<ContextValue>(
    () => ({ status, enable, disable }),
    [status, enable, disable],
  );

  return (
    <XmtpContext.Provider value={value}>{children}</XmtpContext.Provider>
  );
}

export function useXmtp(): ContextValue {
  return useContext(XmtpContext);
}
