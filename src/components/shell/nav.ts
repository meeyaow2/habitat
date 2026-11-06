import { Boxes, FileText, House, LayoutGrid, Receipt, Settings, Users, Wrench, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon; mobilePrimary?: boolean };

export const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", short: "Overview", icon: LayoutGrid, mobilePrimary: true },
  { href: "/home", label: "My Home", short: "Home", icon: House, mobilePrimary: true },
  { href: "/assets", label: "Appliances & Assets", short: "Assets", icon: Boxes, mobilePrimary: true },
  { href: "/maintenance", label: "Maintenance", short: "Tasks", icon: Wrench, mobilePrimary: true },
  { href: "/documents", label: "Documents", short: "Documents", icon: FileText },
  { href: "/expenses", label: "Expenses", short: "Expenses", icon: Receipt },
  { href: "/household", label: "Household", short: "Household", icon: Users },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
