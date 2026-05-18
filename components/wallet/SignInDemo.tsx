'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@/components/wallet/WalletProvider';

type Status =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'signed'; signature: string; verified: boolean; message: string }
  | { kind: 'error'; error: string };

function buildSignInMessage(address: string): string {
  const nonce = Math.random().toString(36).slice(2, 10);
  const issuedAt = new Date().toISOString();
  return [
    'Sign in to Miniapp Boilerplate.',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export function SignInDemo() {
  const { address, isConnected } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSignIn() {
    if (!address) return;
    setStatus({ kind: 'signing' });
    try {
      const { signMessage } = await import('@aboutcircles/miniapp-sdk');
      const message = buildSignInMessage(address);
      const { signature, verified } = await signMessage(message);
      setStatus({ kind: 'signed', signature, verified, message });
    } catch (err) {
      setStatus({
        kind: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Ask the host to sign a message via{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">signMessage</code>.
          The host uses the user&apos;s Safe (EIP-1271) and returns a signature you can verify.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Button onClick={handleSignIn} disabled={!isConnected || status.kind === 'signing'}>
          {status.kind === 'signing' ? 'Waiting for host…' : 'Sign in with Circles'}
        </Button>

        {!isConnected && (
          <p className="text-muted-foreground">
            Connect inside the Circles host first — the button is disabled until a wallet is
            attached.
          </p>
        )}

        {status.kind === 'signed' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={status.verified ? 'default' : 'destructive'}>
                {status.verified ? 'verified' : 'unverified'}
              </Badge>
              <span className="text-muted-foreground">
                Host returned {status.verified ? 'a verified' : 'an unverified'} signature.
              </span>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Message</p>
              <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                {status.message}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Signature</p>
              <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs break-all">
                {status.signature}
              </pre>
            </div>
          </div>
        )}

        {status.kind === 'error' && (
          <p className="text-destructive">Sign-in failed: {status.error}</p>
        )}
      </CardContent>
    </Card>
  );
}
