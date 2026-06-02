"use client";

import { Wall } from "@/components/wall/Wall";
import { SessionGate } from "@/components/auth/SessionGate";
import { MainTabs } from "@/components/layout/MainTabs";

export default function WallPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <MainTabs />
      <SessionGate>{({ address }) => <Wall me={address} />}</SessionGate>
    </div>
  );
}
