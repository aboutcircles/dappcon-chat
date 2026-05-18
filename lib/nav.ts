export type NavItem = {
  href: string;
  label: string;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/actions", label: "Actions" },
];
