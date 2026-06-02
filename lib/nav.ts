export type NavItem = {
  href: string;
  label: string;
  requiresSession?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/wall", label: "Wall", requiresSession: true },
  { href: "/people", label: "People", requiresSession: true },
  { href: "/dms", label: "Messages", requiresSession: true },
  { href: "/settings", label: "Settings", requiresSession: true },
];
