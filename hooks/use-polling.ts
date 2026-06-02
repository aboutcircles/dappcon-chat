"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` on a recurring timer while the document is visible.
 * - Skips ticks when `document.visibilityState === "hidden"` so a locked
 *   phone or backgrounded tab doesn't hammer Neon / the Circles RPC.
 * - Runs once immediately whenever the document becomes visible again.
 * - Uses a recurring `setTimeout` (not `setInterval`) to avoid back-pressure
 *   pile-ups if a callback takes longer than `intervalMs`.
 *
 * Keep your callback idempotent — a missed tick is fine, a doubled tick is
 * fine. We don't expose pause/resume; the visibility heuristic is enough.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (intervalMs <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          try {
            await cbRef.current();
          } catch {
            /* swallow — caller's job to surface errors */
          }
        }
        schedule();
      }, intervalMs);
    }

    function onVisibility() {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        void cbRef.current();
      }
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
