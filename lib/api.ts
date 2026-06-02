"use client";

import { WALLET_HEADER } from "@/lib/session";

/**
 * Wrapper around fetch that injects the connected wallet address as a header.
 * Callers pass the address from `useWallet()`; we keep the call site explicit
 * so React knows when to re-fetch (the address is in the deps).
 */
export async function authedFetch(
  address: `0x${string}` | null,
  input: RequestInfo,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (address) headers.set(WALLET_HEADER, address);
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
