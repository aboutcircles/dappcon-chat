import { normalizeAddress } from "@/lib/addr";

/**
 * Identity model (v0):
 * The Circles host injects a Safe wallet via `onWalletChange`. Because the host
 * is the wallet UI and our miniapp only renders inside that iframe, we treat
 * the host-supplied address as the user's identity. Every API request includes
 * an `X-Wallet-Address` header set from the client wallet context.
 *
 * Trade-off: anyone hitting our API directly can claim any address. The data
 * we store (wall posts, DMs, registration) is conference-scoped and either
 * already public (wall) or gated by hop-distance from the viewer (DMs/feed),
 * so the impact of impersonation is limited. Stronger auth (SIWE-style EIP-1271
 * signature verified against the Safe) is documented as a follow-up.
 *
 * We previously used a signMessage + httpOnly cookie flow, but `SameSite=Lax`
 * blocks the cookie inside the cross-origin Circles iframe, which manifested
 * as "click Sign in, nothing happens" in the host.
 */

export type SessionToken = {
  address: `0x${string}`;
};

const HEADER = "x-wallet-address";

export async function getServerSession(
  req: Request,
): Promise<SessionToken | null> {
  const raw = req.headers.get(HEADER);
  const address = normalizeAddress(raw);
  if (!address) return null;
  return { address };
}

export const WALLET_HEADER = HEADER;
