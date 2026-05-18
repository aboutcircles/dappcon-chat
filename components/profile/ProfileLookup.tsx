'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/components/wallet/WalletProvider';
import { shortenAddress } from '@/lib/utils';

type AvatarType =
  | 'CrcV1_Signup'
  | 'CrcV1_OrganizationSignup'
  | 'CrcV2_RegisterHuman'
  | 'CrcV2_RegisterGroup'
  | 'CrcV2_RegisterOrganization';

type RichProfile = {
  name?: string;
  description?: string;
  imageUrl?: string;
  previewImageUrl?: string;
  location?: string;
};

type ProfileResult = {
  avatarType?: AvatarType;
  version?: number;
  cidV0?: string;
  v2Balance?: string;
  v1Balance?: string;
  trustsCount?: number;
  trustedByCount?: number;
  profile: RichProfile;
};

type LookupResult =
  | { kind: 'found'; address: string; nonce: number; data: ProfileResult }
  | { kind: 'not-registered'; address: string; nonce: number }
  | { kind: 'error'; address: string; nonce: number; error: string };

const TYPE_LABEL: Record<AvatarType, string> = {
  CrcV1_Signup: 'Human (v1)',
  CrcV1_OrganizationSignup: 'Organisation (v1)',
  CrcV2_RegisterHuman: 'Human',
  CrcV2_RegisterGroup: 'Group',
  CrcV2_RegisterOrganization: 'Organisation',
};

function formatCrc(value: string | undefined): string | null {
  // The RPC returns balances as already-scaled decimal strings (e.g. "1219.71…").
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function ProfileLookup() {
  const { address, isConnected } = useWallet();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    (async () => {
      try {
        const { Sdk } = await import('@aboutcircles/sdk');
        const sdk = new Sdk();
        // `getProfileView` returns avatarInfo + indexed profile + trust stats + balances
        // in one call, and returns an empty/partial view (rather than throwing) when
        // the address is not a registered Circles avatar.
        const view = await sdk.rpc.profile.getProfileView(address as `0x${string}`);

        if (!view.avatarInfo) {
          if (cancelled) return;
          setResult({ kind: 'not-registered', address, nonce });
          return;
        }

        // Optionally hydrate richer fields (description, image) from IPFS via the CID.
        let ipfs: RichProfile = {};
        if (view.avatarInfo.cidV0) {
          try {
            const full = await sdk.rpc.profile.getProfileByCid(view.avatarInfo.cidV0);
            if (full) ipfs = full as RichProfile;
          } catch {
            // The CID may not resolve (deleted, pinning issue); fall through with view data only.
          }
        }

        if (cancelled) return;
        setResult({
          kind: 'found',
          address,
          nonce,
          data: {
            avatarType: view.avatarInfo.type as AvatarType,
            version: view.avatarInfo.version,
            cidV0: view.avatarInfo.cidV0 || undefined,
            v2Balance: view.v2Balance,
            v1Balance: view.v1Balance,
            trustsCount: view.trustStats?.trustsCount,
            trustedByCount: view.trustStats?.trustedByCount,
            profile: {
              name: ipfs.name ?? view.profile?.name,
              description: ipfs.description,
              imageUrl: ipfs.imageUrl,
              previewImageUrl: ipfs.previewImageUrl,
              location: ipfs.location,
            },
          },
        });
      } catch (err) {
        if (cancelled) return;
        setResult({
          kind: 'error',
          address,
          nonce,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, nonce]);

  if (!isConnected || !address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Connect inside the Circles host to look up the user&apos;s avatar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fresh = result && result.address === address && result.nonce === nonce ? result : null;
  const isLoading = !fresh;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Circles avatar</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNonce((n) => n + 1)}
            disabled={isLoading}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </Button>
        </CardTitle>
        <CardDescription>
          Fetched via{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            sdk.rpc.profile.getProfileView(address)
          </code>{' '}
          from{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            @aboutcircles/sdk
          </code>
          .
        </CardDescription>
      </CardHeader>

      <CardContent className="text-sm">
        {isLoading && <ProfileSkeleton />}

        {fresh?.kind === 'not-registered' && (
          <p className="text-muted-foreground">
            This address is not a registered Circles avatar. Sign up at{' '}
            <a
              className="underline"
              href="https://app.metri.xyz"
              target="_blank"
              rel="noreferrer"
            >
              app.metri.xyz
            </a>{' '}
            to claim one.
          </p>
        )}

        {fresh?.kind === 'error' && (
          <p className="text-destructive">{fresh.error}</p>
        )}

        {fresh?.kind === 'found' && <ProfileView data={fresh.data} address={address} />}
      </CardContent>
    </Card>
  );
}

function ProfileView({ data, address }: { data: ProfileResult; address: string }) {
  const imageUrl = data.profile.previewImageUrl ?? data.profile.imageUrl;
  const name = data.profile.name ?? 'Unnamed avatar';
  const initials = name.slice(0, 2).toUpperCase();
  const v2 = formatCrc(data.v2Balance);
  const v1 = formatCrc(data.v1Balance);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex shrink-0 items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="size-24 rounded-full border object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full border bg-muted text-2xl font-semibold text-muted-foreground">
            {initials}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{name}</h3>
            {data.avatarType && (
              <Badge variant="secondary">{TYPE_LABEL[data.avatarType]}</Badge>
            )}
            {data.version && <Badge variant="outline">v{data.version}</Badge>}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {shortenAddress(address)} · {address}
          </p>
        </div>

        {data.profile.description && (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {data.profile.description}
          </p>
        )}

        <div className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
          {v2 != null && (
            <>
              <span className="text-muted-foreground">CRC balance</span>
              <span className="font-mono">{v2}</span>
            </>
          )}
          {v1 != null && (
            <>
              <span className="text-muted-foreground">CRC (v1) balance</span>
              <span className="font-mono">{v1}</span>
            </>
          )}
          {(data.trustsCount != null || data.trustedByCount != null) && (
            <>
              <span className="text-muted-foreground">Trust</span>
              <span>
                trusts {data.trustsCount ?? 0} · trusted by{' '}
                {data.trustedByCount ?? 0}
              </span>
            </>
          )}
          {data.profile.location && (
            <>
              <span className="text-muted-foreground">Location</span>
              <span>{data.profile.location}</span>
            </>
          )}
          {data.cidV0 && (
            <>
              <span className="text-muted-foreground">Profile CID</span>
              <span className="font-mono break-all">{data.cidV0}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <Skeleton className="size-24 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    </div>
  );
}
