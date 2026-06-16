"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useXmtp } from "@/components/xmtp/XmtpProvider";
import { authedFetch } from "@/lib/api";
import type { Client } from "@xmtp/browser-sdk";

export function SettingsForm() {
  const { address } = useWallet();
  const me = (address as `0x${string}` | null) ?? null;
  const router = useRouter();
  const { status: xmtpStatus, disable: disableXmtp } = useXmtp();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteMyData() {
    if (!me) return;
    setDeleting(true);
    try {
      const res = await authedFetch(me, "/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted. Redirecting…");
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function resetXmtp() {
    if (!me) return;
    // Drop the localStorage marker so the next enable() treats the wallet
    // as fresh and re-derives the inbox state. OPFS is cleared by the
    // browser-side SDK on the next Client.create from the fresh state.
    try {
      const key = `xmtp-inbox-${me.toLowerCase()}`;
      localStorage.removeItem(key);
    } catch {
      /* ignore — localStorage may be unavailable in some hosts */
    }
    disableXmtp();
    toast.success(
      "XMTP state cleared. Next time you open DMs you'll be asked to sign once.",
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Registration</h2>
          <p className="text-xs text-ink-muted">
            Update your attendance mode, bio and interests.
          </p>
        </div>
        <Link
          href="/register"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit registration
        </Link>
      </section>

      <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Encrypted DMs (XMTP)</h2>
          <p className="text-xs text-ink-muted">
            {xmtpStatus.kind === "ready"
              ? "Your XMTP inbox is active. Reset if you're moving to a new device or want to start over."
              : "Will be set up automatically next time you open the DMs tab or finish registration."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetXmtp}
          disabled={xmtpStatus.kind === "idle"}
        >
          Reset XMTP state
        </Button>
      </section>

      {xmtpStatus.kind === "ready" && (
        <XmtpDebugPanel
          inboxId={xmtpStatus.inboxId}
          installationId={xmtpStatus.installationId}
          freshInstall={xmtpStatus.freshInstall}
          client={xmtpStatus.client}
        />
      )}

      <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-destructive">
            Delete my data
          </h2>
          <p className="text-xs text-ink-muted">
            Wipes your registration, posts and reactions on our server. DMs
            live on the XMTP network and aren&apos;t affected — use Reset XMTP
            state above to clear those locally.
          </p>
        </div>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={deleteMyData}
            >
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            Delete my data
          </Button>
        )}
      </section>
    </div>
  );
}

function XmtpDebugPanel({
  inboxId,
  installationId,
  freshInstall,
  client,
}: {
  inboxId: string;
  installationId: string | null;
  freshInstall: boolean;
  client: Client;
}) {
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function forceResync() {
    setSyncing(true);
    try {
      await client.conversations.syncAll();
      setLastSyncAt(Date.now());
      toast.success(
        "Synced. Open the DMs tab — any newly-welcomed conversations will appear.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
      <div>
        <h2 className="text-sm font-semibold">XMTP diagnostics</h2>
        <p className="text-xs text-ink-muted">
          Inspect the device-local XMTP state and force a network resync if
          conversations look stale.
        </p>
      </div>
      <dl className="space-y-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="w-32 shrink-0 text-ink-muted">Inbox ID</dt>
          <dd className="break-all font-mono">{inboxId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 shrink-0 text-ink-muted">Installation ID</dt>
          <dd className="break-all font-mono">{installationId ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 shrink-0 text-ink-muted">Local DB origin</dt>
          <dd>
            {freshInstall
              ? "freshly created this session — peers re-welcome lazily"
              : "reattached from existing browser storage"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 shrink-0 text-ink-muted">Last force-sync</dt>
          <dd className="font-mono">
            {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "—"}
          </dd>
        </div>
      </dl>
      <Button
        variant="outline"
        size="sm"
        onClick={forceResync}
        disabled={syncing}
      >
        {syncing ? "Syncing…" : "Force resync"}
      </Button>
    </section>
  );
}
