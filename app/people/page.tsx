"use client";

import { PeopleDirectory } from "@/components/people/PeopleDirectory";
import { SessionGate } from "@/components/auth/SessionGate";
import { MainTabs } from "@/components/layout/MainTabs";

export default function PeoplePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <MainTabs />
      <SessionGate>
        {({ address }) => <PeopleDirectory me={address} />}
      </SessionGate>
    </div>
  );
}
