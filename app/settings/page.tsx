"use client";

import { SettingsForm } from "@/components/settings/SettingsForm";
import { SessionGate } from "@/components/auth/SessionGate";
import { PageTitle } from "@/components/layout/PageTitle";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <PageTitle eyebrow="You" title="Settings" />
      <SessionGate>{() => <SettingsForm />}</SessionGate>
    </div>
  );
}
