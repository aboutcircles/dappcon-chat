# Embedded Miniapps Boilerplate

A minimal **Next.js 16 + shadcn/ui + TypeScript** starter for building [Circles](https://aboutcircles.com) embedded miniapps. It wires up:

- [`@aboutcircles/miniapp-sdk`](https://www.npmjs.com/package/@aboutcircles/miniapp-sdk) — host-injected wallet, transaction submission, message signing
- [`@aboutcircles/sdk`](https://www.npmjs.com/package/@aboutcircles/sdk) — read-only Circles data (avatar lookup, profile, balances, trust graph)

## Quickstart

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard renders with a sidebar of placeholder routes and a "Not connected" badge — that is expected outside the Circles host.

## How wallet connection works

The Circles host runs your miniapp inside an iframe and **pushes the wallet address to you** — there is no "Connect" button click flow. The SDK exposes one subscription primitive:

```ts
import { onWalletChange } from '@aboutcircles/miniapp-sdk';

const unsubscribe = onWalletChange((address) => {
  // address is the Safe address the user picked in the host, or null on disconnect.
});
```

`components/wallet/WalletProvider.tsx` wraps this in a React context. Anywhere in a client component you can do:

```tsx
import { useWallet } from '@/hooks/use-wallet';

const { address, isConnected, isMiniappHost } = useWallet();
```

Running standalone (`pnpm dev` in a normal browser tab), `isMiniappHost` is `false` and the callback never fires — the UI stays disconnected. This is by design; the SDK ships with no fallback wallet because Circles miniapps are always wallet-injected by the host.

### Testing inside the Circles playground

The [Circles playground](https://circles.gnosis.io/playground) iframes any HTTPS URL you paste into it — no manifest, registration, or fork required.

1. Deploy the app to a public HTTPS URL (Vercel preview deploys work great: `git push` → grab the `https://*.vercel.app` URL).
2. Open `https://circles.gnosis.io/playground` and paste your deploy URL into the input, **or** open `https://circles.gnosis.io/playground?url=<your-deploy-url>` directly.
3. The host injects a Safe address, the badge in the header flips to a shortened address, and the *Sign in* / `sendTransactions` flows start working end-to-end.

[`next.config.ts`](next.config.ts) ships with a `Content-Security-Policy: frame-ancestors` header pre-allowing `*.gnosis.io` (covers both `circles.gnosis.io` prod and `circles-dev.gnosis.io` dev hosts) and `*.vercel.app`. If you deploy to a different host, add it there.

#### Listing in the marketplace

For permanent placement in the host's catalog, open a PR against [`aboutcircles/CirclesMiniapps`](https://github.com/aboutcircles/CirclesMiniapps) adding an entry to `static/miniapps.json`:

```json
{
  "slug": "your-app",
  "name": "Your App",
  "url": "https://your-app.example.com/",
  "logo": "https://your-app.example.com/icon.svg",
  "description": "One-liner.",
  "tags": ["demo"],
  "isHidden": false
}
```

## Signing in (message signing)

The host can ask the user's Safe to sign an arbitrary message via EIP-1271. The dashboard's *Sign in* card demonstrates the full round-trip:

```ts
'use client';
import { signMessage } from '@aboutcircles/miniapp-sdk';

const { signature, verified } = await signMessage(
  'Sign in to my miniapp\nNonce: abc123',
);
```

`verified` reflects whether the host already validated the signature against the user's Safe; you can re-verify server-side before issuing a session cookie. See [`components/wallet/SignInDemo.tsx`](components/wallet/SignInDemo.tsx).

## Looking up a Circles profile

The [`@aboutcircles/sdk`](https://www.npmjs.com/package/@aboutcircles/sdk) package provides a higher-level, read-friendly client. The `/profile` route uses its consolidated **profile view** endpoint to pull avatar info, name, trust stats, and balances for the connected address in a single call:

```ts
'use client';
import { Sdk } from '@aboutcircles/sdk';

const sdk = new Sdk(); // defaults to Gnosis Chain mainnet
const view = await sdk.rpc.profile.getProfileView(address);
// → { avatarInfo?, profile?, trustStats, v2Balance?, v1Balance? }

if (view.avatarInfo?.cidV0) {
  // optionally pull the full IPFS profile for richer fields (description, image)
  const full = await sdk.rpc.profile.getProfileByCid(view.avatarInfo.cidV0);
}
```

**Why `getProfileView` and not `sdk.getAvatar()`?** `getAvatar()` is the right call when you need a write-capable `Avatar` instance (trust, transfer, mint). For read-only lookups it can throw a misleading "Avatar not found" error even on valid avatars whose on-chain `cidV0Digest` is empty. `getProfileView()` is the read primitive and degrades gracefully — it returns `avatarInfo: undefined` for addresses that aren't Circles avatars.

For write flows, fall back to `sdk.getAvatar(address)` once the user has both a wallet and a registered avatar; the same object exposes `balances`, `trust`, `history`, `transfer`. See [`components/profile/ProfileLookup.tsx`](components/profile/ProfileLookup.tsx).

## Sending transactions

```ts
'use client';
import { sendTransactions } from '@aboutcircles/miniapp-sdk';

const txHashes = await sendTransactions([
  { to: '0x…', data: '0x…', value: '0' },
]);
```

The host batches and signs through the user's Safe and returns the resulting tx hashes.

## Project layout

```
app/
  layout.tsx              Root: wraps every page in <WalletProvider><AppShell>
  page.tsx                Dashboard — connection card, sign-in demo, nav cards
  profile/page.tsx        Circles avatar lookup via @aboutcircles/sdk
  actions/page.tsx        Placeholder (where sendTransactions demos go)
  globals.css             Tailwind v4 + shadcn tokens (light only)
components/
  layout/                 AppShell, Header, Sidebar, NavCards
  wallet/                 WalletProvider, WalletStatus, ConnectionCard, SignInDemo
  profile/                ProfileLookup (uses @aboutcircles/sdk)
  ui/                     shadcn-generated primitives
hooks/use-wallet.ts       Re-export of useWallet
lib/
  utils.ts                cn() + shortenAddress()
  nav.ts                  Sidebar nav items (single source of truth)
```

## Where to add business logic

- **Read-only flows** (profile, balance, trust graph) — call `useWallet()` to get the address, then drive `@aboutcircles/sdk` from a client component. See `ProfileLookup` for the pattern.
- **Write flows** — keep `sendTransactions()` calls inside `'use client'` components; build the calldata however you like (viem, ethers, or hand-encoded).
- **Authentication** — call `signMessage()` to sign a SIWE-style nonce; re-verify the signature on your backend. See `SignInDemo`.
- **New routes** — drop a `page.tsx` under `app/<route>/` and add an entry to `lib/nav.ts` to expose it in the sidebar.

## Scripts

| Command       | What it does                       |
| ------------- | ---------------------------------- |
| `pnpm dev`    | Start the dev server on `:3000`    |
| `pnpm build`  | Production build                   |
| `pnpm start`  | Run the built app                  |
| `pnpm lint`   | ESLint                             |

## Gotchas

- **Both SDKs touch `window`.** They must be dynamically imported inside a client component's `useEffect` — `WalletProvider` and `ProfileLookup` already do this. Don't import them at the top level of a server component or you'll see `window is not defined` during build.
- **No connect button.** If you find yourself adding one, you're working around the wrong problem — the host is the wallet UI.
- **`getAvatar` throws for unregistered addresses.** Most EOAs aren't Circles avatars. The `/profile` page surfaces this as a friendly error; don't treat it as a bug.
- **Light mode only.** The dark-mode CSS variables are stripped from `globals.css`. If you re-add dark mode later, restore the `.dark { … }` block and the `@custom-variant dark` directive, then add `next-themes`.
- **Tailwind v4.** No `tailwind.config.js`; theme tokens live in `app/globals.css` under `@theme inline { … }`.

## Learn more

- [**Embedded miniapps** — official Circles docs](https://docs.aboutcircles.com/miniapps/embedded-mini-apps) — the host/iframe contract, lifecycle, postMessage protocol, and what's coming next. Start here if you want to understand *why* the SDK is shaped the way it is.
- [Circles playground](https://circles.gnosis.io/playground) — paste a URL, iframe it as a miniapp
- [`aboutcircles/CirclesMiniapps`](https://github.com/aboutcircles/CirclesMiniapps) — host repo; submit a PR to `static/miniapps.json` for marketplace listing
- [`@aboutcircles/miniapp-sdk` on npm](https://www.npmjs.com/package/@aboutcircles/miniapp-sdk) — host bridge (wallet, signing, transactions)
- [`@aboutcircles/sdk` on npm](https://www.npmjs.com/package/@aboutcircles/sdk) — Circles data (avatars, profiles, balances, trust)
- [`aboutcircles/circles-groups-miniapp`](https://github.com/aboutcircles/circles-groups-miniapp) — the original (vanilla JS + Vite) reference miniapp this template draws from

## License

MIT
