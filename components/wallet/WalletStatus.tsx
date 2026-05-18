'use client';

import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/components/wallet/WalletProvider';
import { shortenAddress } from '@/lib/utils';

export function WalletStatus() {
  const { address, isConnected } = useWallet();

  return (
    <Badge variant={isConnected ? 'default' : 'secondary'} className="font-mono">
      <span
        className={
          'mr-1.5 inline-block size-1.5 rounded-full ' +
          (isConnected ? 'bg-emerald-500' : 'bg-muted-foreground')
        }
        aria-hidden
      />
      {address ? shortenAddress(address) : 'Not connected'}
    </Badge>
  );
}
