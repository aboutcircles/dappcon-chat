"use client";

import { use } from "react";

import { PersonDetail } from "@/components/people/PersonDetail";
import { SessionGate } from "@/components/auth/SessionGate";

export default function PersonPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <SessionGate>
        {({ address: me }) => <PersonDetail me={me} address={address} />}
      </SessionGate>
    </div>
  );
}
