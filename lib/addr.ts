import { getAddress, isAddress } from "viem";

/**
 * Normalize an EVM address to its checksummed form, returning null if invalid.
 * Used everywhere we read addresses from cookies, params, or untrusted input.
 */
export function normalizeAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return null;
  return getAddress(trimmed);
}
