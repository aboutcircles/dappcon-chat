"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/wall", label: "Feed" },
  { href: "/dms", label: "DMs" },
  { href: "/people", label: "People" },
];

export function MainTabs() {
  const pathname = usePathname();
  return (
    <div
      role="tablist"
      className="flex w-full rounded-full bg-surface p-1.5 shadow-card"
    >
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex-1 rounded-full px-5 py-2.5 text-center text-base font-medium transition-colors",
              isActive
                ? "bg-ink text-surface"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
