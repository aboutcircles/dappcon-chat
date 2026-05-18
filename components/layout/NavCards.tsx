import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Item = {
  href: string;
  title: string;
  description: string;
};

const ITEMS: Item[] = [
  {
    href: '/profile',
    title: 'Profile',
    description: 'Look up the connected user’s Circles avatar — name, description, image.',
  },
  {
    href: '/actions',
    title: 'Actions',
    description: 'Build and submit transactions through the host via sendTransactions().',
  },
];

export function NavCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {item.title}
                <span aria-hidden className="text-muted-foreground">→</span>
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground font-mono">
              {item.href}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
