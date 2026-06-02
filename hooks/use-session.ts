"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/api";
import type { Attendee, Settings } from "@/lib/types";

export type MeResponse = {
  session: { address: `0x${string}` } | null;
  attendee?: Attendee | null;
  settings?: Settings | null;
};

/**
 * Loads /api/me for the supplied wallet address. Pass null while the host
 * hasn't pushed a wallet yet — we return `session: null` without hitting
 * the network.
 */
export function useSession(address: `0x${string}` | null) {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setData({ session: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(address, "/api/me");
      const json = (await res.json()) as MeResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
      setData({ session: null });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
