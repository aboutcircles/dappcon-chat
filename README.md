# Conference DM

A Circles miniapp for conference attendees: a shared wall and 1:1 DMs, filtered by the Circles trust graph.

Built on top of the [`embedded-miniapp-boilerplate`](https://github.com/aboutcircles/embedded-miniapp-boilerplate) (Next.js 16 App Router + TypeScript + shadcn/ui + Tailwind v4 + pnpm). See [`AGENTS.md`](AGENTS.md) for the boilerplate's SDK rules and styling conventions — they still apply.

## What it does

| Surface | Behaviour |
| --- | --- |
| `/` | Landing. If no Circles wallet → instructions to onboard (magic-link placeholder). If wallet → "Sign in with Circles" (one EIP-1271 signature, no gas). |
| `/register` | Pick in-person vs. online; add optional bio + interests. |
| `/wall` | Composer + feed. Each post shows the author's Circles profile. Toggle the **hop filter** to scope the feed to people within N trust-graph hops. |
| `/people` | Directory of registered attendees, badged by hop distance and attendance mode. |
| `/people/[address]` | Profile detail. Shows **Open conversation** if you're within the recipient's DM-hop range, otherwise an explainer. |
| `/dms` & `/dms/[address]` | Conversation list + 1:1 thread with auto-poll. |
| `/settings` | Two sliders: `feedHops` (your wall filter) and `dmHops` (the max distance someone can be and still DM you). Default 2 each, capped at 6. |

## Architecture

- **Auth** — host injects the wallet via `@aboutcircles/miniapp-sdk`; sign-in is a SIWE-style message signed with `signMessage`, verified server-side via viem's `verifyMessage` against Gnosis Chain (EIP-1271). Success sets an HMAC-signed `httpOnly` session cookie keyed to the Safe address.
- **Trust graph** — `lib/trust.ts` walks an undirected BFS using `rpc.trust.getTrusts` + `rpc.trust.getTrustedBy`, with per-address neighbour caching (60s TTL). Hop counts are bounded by each call's `maxHops` so we never traverse the whole graph.
- **Profiles** — `lib/profile-fetch.ts` reads `getProfileView` + `getProfileByCid` and caches the merged card for 5 min.
- **Storage** — `lib/store.ts` is a JSON-file-backed store at `/tmp/dmdappcon-data.json` (override with `DATA_FILE`). Tables: `attendees`, `settings`, `posts`, `dms`. Replace with Vercel KV / Neon / Upstash before going multi-region.
- **DM privacy** — messages are stored server-side in v0 (private to the conversation pair, gated by hop distance on each send). End-to-end encryption via XMTP is on the roadmap; see [`xmtp-circles-miniapp`](https://github.com/zengzengzenghuy/xmtp-circles-miniapp) for the reference integration.

## Environment

```bash
# Required in production. Dev falls back to an ephemeral secret.
SESSION_SECRET=<32+ char random string>

# Optional override for the JSON store path.
DATA_FILE=/var/lib/dmdappcon/data.json

# Optional override for the Gnosis Chain RPC used during sign-in verification.
GNOSIS_RPC_URL=https://rpc.gnosischain.com
```

## Running

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build (Turbopack)
pnpm lint
```

The standalone `pnpm dev` view shows "disconnected" — that's expected. Test inside the host iframe at `https://circles.gnosis.io/playground?url=<your-https-url>`.

## Stubs / known gaps

- **Magic-link onboarding** — the landing page links to `app.metri.xyz` as a placeholder. Swap in the conference's magic-link URL once available.
- **Proof of presence** — in-person attendees are taken at their word. Add a venue-bound check (geofence, QR scan, Safe-signed event token) when needed.
- **Storage** — JSON file at `/tmp` is wiped on container restart. Move to a managed store before any real conference use.
- **E2E encryption** — DMs are TLS-private but server-readable. XMTP integration is the planned next step.
