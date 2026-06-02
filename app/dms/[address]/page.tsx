"use client";

import { use } from "react";

import { DmThread } from "@/components/dms/DmThread";
import { SessionGate } from "@/components/auth/SessionGate";

export default function DmThreadPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <SessionGate>
        {({ address: me }) => <DmThread me={me} peerAddress={address} />}
      </SessionGate>
    </div>
  );
}
