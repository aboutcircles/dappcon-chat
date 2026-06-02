"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/WalletProvider";
import { authedFetch } from "@/lib/api";

export function SettingsForm() {
  const { address } = useWallet();
  const me = (address as `0x${string}` | null) ?? null;
  const router = useRouter();
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
          <h2 className="text-sm font-semibold text-destructive">
            Delete my data
          </h2>
          <p className="text-xs text-ink-muted">
            Wipes your registration, posts, reactions and DMs. Cannot be
            undone.
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
