"use client";

import { Button } from "@/components/ui/button";
import { useXmtp } from "@/components/xmtp/XmtpProvider";

/**
 * Lazy XMTP enablement. Rendered whenever a DM surface needs an XMTP client
 * but the user hasn't initialised one yet. A single sign-message popup from
 * the Circles host creates the inbox; OPFS keeps the keys for next time.
 */
export function EnableDmsCard() {
  const { status, enable } = useXmtp();
  const initializing = status.kind === "initializing";
  const errored = status.kind === "error";

  return (
    <section className="rounded-[20px] bg-surface p-6 shadow-card space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
          End-to-end encrypted
        </p>
        <h2 className="text-base font-semibold">Enable DMs</h2>
      </div>
      <p className="text-sm text-ink-muted">
        Dappcon Chat uses{" "}
        <a
          href="https://xmtp.org"
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:text-brand-press"
        >
          XMTP
        </a>{" "}
        for direct messages — your conversations are end-to-end encrypted and
        never touch our server. To set up your inbox, the Circles host will
        ask you to sign one message.
      </p>
      <Button
        variant="brand"
        onClick={() => {
          void enable();
        }}
        disabled={initializing}
      >
        {initializing ? "Setting up…" : "Sign and enable DMs"}
      </Button>
      {errored && (
        <p className="rounded-[14px] bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {status.message}
        </p>
      )}
    </section>
  );
}
