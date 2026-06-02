"use client";

import { ConversationList } from "@/components/dms/ConversationList";
import { SessionGate } from "@/components/auth/SessionGate";
import { MainTabs } from "@/components/layout/MainTabs";

export default function DmsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <MainTabs />
      <SessionGate>
        {({ address }) => <ConversationList me={address} />}
      </SessionGate>
    </div>
  );
}
