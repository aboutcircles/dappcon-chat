import { PageNav } from '@/components/layout/PageNav';
import { ProfileLookup } from '@/components/profile/ProfileLookup';

export default function ProfilePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Look up the connected user&apos;s Circles avatar metadata.
        </p>
      </div>

      <ProfileLookup />

      <PageNav />
    </div>
  );
}
