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

const COMMON_OPTS = {
  dbEncryptionKey: undefined,
  appVersion: "dappcon-chat/1",
} as const;

export function XmtpProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Track the wallet address that the current client belongs to so we can
  // tear it down when the user switches Safes mid-session.
  const clientAddressRef = useRef<string | null>(null);
  // Guard so the silent reattach effect doesn't refire for the same address
  // (e.g. on every render).
  const attachAttemptedFor = useRef<string | null>(null);

  const disable = useCallback(() => {
    clientAddressRef.current = null;
    attachAttemptedFor.current = null;
    setStatus({ kind: "idle" });
  }, []);

  /**
   * Silent reattach via `Client.build(identifier, options)` — no signer,
   * no signature. Works only if a local OPFS DB already exists AND it
   * contains a fully registered identity. Returns true on success, false
   * if anything is amiss; the caller falls back to the explicit Enable
   * flow which runs Client.create.
   *
   * After a successful build we verify `client.isRegistered`. If the local
   * SQLite was opened but never finished registration (e.g. an earlier
   * Client.create was interrupted, or the signature was dismissed mid-
   * flow), `isRegistered` is false and any subsequent operation throws
   * the wasm-bindings "Uninitialized identity" error. We catch that
   * here and stale-mark the inbox so the next Enable cleans up.
   */
  const tryBuild = useCallback(
    async (addr: `0x${string}`): Promise<boolean> => {
      if (typeof window === "undefined") return false;
      const marker = localStorage.getItem(inboxKey(addr));
      if (!marker) return false;
      try {
        const [{ Client, IdentifierKind, LogLevel }] = await Promise.all([
          import("@xmtp/browser-sdk"),
        ]);
        const client = await Client.build(
          {
            identifier: addr.toLowerCase(),
            identifierKind: IdentifierKind.Ethereum,
          },
          {
            env: getEnv(),
            loggingLevel: LogLevel.Info,
            ...COMMON_OPTS,
          },
        );
        const inboxId = client.inboxId;
        if (!inboxId) {
          console.info("[xmtp] Client.build returned no inbox id");
          return false;
        }
        if (!client.isRegistered) {
          // Local DB is half-built. Drop the marker so the next
          // Enable click runs Client.create from scratch instead of
          // attempting another build on the same stale state.
          console.warn(
            "[xmtp] Client.build returned an unregistered identity — clearing marker",
          );
          localStorage.removeItem(inboxKey(addr));
          return false;
        }
        clientAddressRef.current = addr;
        setStatus({ kind: "ready", client, inboxId });
        return true;
      } catch (err) {
        // Common cause: local OPFS database doesn't exist (cleared browser
        // storage, new device, fresh incognito session). Not an error per
        // se — fall back to the explicit enable flow.
        console.info("[xmtp] silent reattach failed:", err);
        return false;
      }
    },
    [],
  );

  const enable = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setStatus({
        kind: "error",
        message: "No wallet — open this app from the Circles host first.",
      });
      return false;
    }
    if (
      status.kind === "ready" &&
      clientAddressRef.current?.toLowerCase() === address.toLowerCase()
    ) {
      return true;
    }

    // Try the silent path first. If it works, we're done without the popup.
    if (await tryBuild(address as `0x${string}`)) return true;

    setStatus({ kind: "initializing" });
    try {
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
        loggingLevel: LogLevel.Info,
        ...COMMON_OPTS,
      });

      try {
        await client.sendSyncRequest();
      } catch (err) {
        console.warn("[xmtp] sendSyncRequest failed (non-fatal):", err);
      }

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
  }, [address, status, tryBuild]);

  // Auto-reattach on mount and on address change. Uses `Client.build` so it
  // never prompts a signature — if the local DB is missing, we silently
  // fail and wait for the user to hit Enable DMs. Per-address attempt
  // guard prevents re-runs.
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
      return;
    }
    if (status.kind !== "idle") return;
    if (attachAttemptedFor.current === address.toLowerCase()) return;
    attachAttemptedFor.current = address.toLowerCase();
    void tryBuild(address as `0x${string}`);
  }, [address, disable, status, tryBuild]);

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
