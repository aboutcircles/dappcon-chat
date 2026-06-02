"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageTitle } from "@/components/layout/PageTitle";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useSession } from "@/hooks/use-session";
import { authedFetch } from "@/lib/api";
import { isTagOption, TAG_OPTIONS, type TagOption } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { AttendanceMode } from "@/lib/types";

export default function RegisterPage() {
  const { address } = useWallet();
  const me = (address as `0x${string}` | null) ?? null;
  const { data, loading, refresh } = useSession(me);
  const router = useRouter();
  const [mode, setMode] = useState<AttendanceMode>("in-person");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<TagOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!data?.session) {
      router.replace("/");
      return;
    }
    if (data.attendee) {
      setMode(data.attendee.mode);
      setBio(data.attendee.bio);
      setInterests(data.attendee.interests.filter(isTagOption));
    }
  }, [data, loading, router]);

  function toggleInterest(tag: TagOption) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function submit() {
    if (!me) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(me, "/api/attendees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, bio, interests }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? `Failed (${res.status})`);
      }
      await refresh();
      router.push("/wall");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !data?.session) {
    return (
      <div className="mx-auto max-w-lg">
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  const isUpdate = !!data.attendee;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <PageTitle
        eyebrow={isUpdate ? "Update" : "Register"}
        title={isUpdate ? "Your registration" : "Register"}
      />

      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Attendance</Label>
          <div className="grid grid-cols-2 gap-2">
            <ModeChip
              value="in-person"
              current={mode}
              onChange={setMode}
              label="In person"
            />
            <ModeChip
              value="online"
              current={mode}
              onChange={setMode}
              label="Online"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio">Bio</Label>
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Optional
            </span>
          </div>
          <Textarea
            id="bio"
            placeholder="What you do, what brings you here…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>Interests</Label>
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Optional
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => {
              const selected = interests.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    selected
                      ? "bg-tag-social text-white"
                      : "bg-hairline text-ink hover:bg-ink/10",
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={submitting}
          variant="brand"
          className="w-full"
        >
          {submitting ? "Saving…" : isUpdate ? "Save" : "Register"}
        </Button>
      </div>
    </div>
  );
}

function ModeChip({
  value,
  current,
  onChange,
  label,
}: {
  value: AttendanceMode;
  current: AttendanceMode;
  onChange: (v: AttendanceMode) => void;
  label: string;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "h-11 rounded-[14px] text-sm font-medium transition-colors",
        selected
          ? "bg-ink text-surface"
          : "bg-surface text-ink hover:bg-hairline",
      )}
    >
      {label}
    </button>
  );
}
