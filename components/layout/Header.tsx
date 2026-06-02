"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { useWallet } from "@/components/wallet/WalletProvider";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useWallet();
  const { data } = useSession((address as `0x${string}` | null) ?? null);
  const showSecondary = !!data?.session && !!data?.attendee;
  const onSettings = pathname.startsWith("/settings");

  return (
    <header className="bg-canvas">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="inline-block size-7 rounded-md bg-brand"
          />
          Dappcon Chat
        </Link>
        <div className="flex items-center gap-2">
          {showSecondary && (
            // Pressing the settings button while ON /settings pops you back to
            // /wall — matches the toggle expectation users have.
            <Link
              href={onSettings ? "/wall" : "/settings"}
              aria-label={onSettings ? "Close settings" : "Settings"}
              aria-pressed={onSettings}
              title={onSettings ? "Close settings" : "Settings"}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-full transition-colors",
                onSettings
                  ? "bg-ink text-surface"
                  : "bg-surface text-ink hover:bg-hairline",
              )}
            >
              <Settings className="size-5" />
            </Link>
          )}
          {!isConnected && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <span
                className="inline-block size-1.5 rounded-full bg-ink-muted/40"
                aria-hidden
              />
              Not connected
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
