import { shortenAddress } from "@/lib/utils";

type Props = {
  name?: string | null;
  address: string;
  className?: string;
};

export function ProfileName({ name, address, className }: Props) {
  if (name && name.trim()) {
    return <span className={className}>{name.trim()}</span>;
  }
  return <span className={className}>{shortenAddress(address)}</span>;
}
