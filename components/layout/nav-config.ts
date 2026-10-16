import { can, featureForPath, type AccessSnapshot } from "@/lib/access";
import {
  Boxes,
  Briefcase,
  Building,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  Clock,
  Eye,
  FileText,
  GitBranch,
  HandCoins,
  KeyRound,
  Landmark,
  Layers,
  PauseCircle,
  Percent,
  Receipt,
  Settings2,
  Shield,
  Tags,
  Timer,
  TreePalm,
  Undo2,
  UserCog,
  UserPlus,
  UserSearch,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Single source for the sidebar, the collapsed sidebar and menu search.
// A link without href is a screen that is not built yet.

export type NavLink = {
  label: string;
  icon: LucideIcon;
  href?: string;
};

export type NavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

export type NavEntry = ({ kind: "item" } & NavLink) | ({ kind: "group" } & NavGroup);

export type NavSection = {
  key: string;
  title: string;
  entries: NavEntry[];
};

const item = (label: string, icon: LucideIcon, href?: string): NavEntry => ({
  kind: "item",
  label,
  icon,
  href,
});

const group = (key: string, label: string, icon: LucideIcon, items: NavLink[]): NavEntry => ({
  kind: "group",
  key,
  label,
  icon,
  items,
});

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "employeeManagement",
    title: "Employee Management",
    entries: [
      item("Employees", Users, "/employees"),
      group("attendance", "Attendance", CalendarCheck, [
        { label: "Mark attendance", icon: ClipboardPen, href: "/attendance/mark" },
        { label: "View attendance", icon: Eye, href: "/attendance/view" },
      ]),
      group("leave", "Leave", TreePalm, [
        { label: "Leave requests", icon: FileText, href: "/leave/requests" },
        { label: "Leave balances", icon: Wallet, href: "/leave/balances" },
      ]),
      group("hiring", "Hiring and onboarding", UserPlus, [
        { label: "Hiring requests", icon: ClipboardCheck, href: "/hiring/requests" },
        { label: "Candidates", icon: UserSearch, href: "/hiring/candidates" },
      ]),
    ],
  },
  {
    key: "payroll",
    title: "Payroll",
    entries: [
      group("payrollProcessing", "Payroll processing", Calculator, [
        { label: "Mid month payroll processing", icon: CalendarClock, href: "/payroll/mid-month" },
        { label: "Overtime month payroll processing", icon: Clock, href: "/payroll/overtime" },
        { label: "Monthly payroll processing", icon: Calendar, href: "/payroll/monthly" },
      ]),
      item("Loan management", HandCoins, "/payroll/loans"),
      item("Payslip viewer", FileText, "/payroll/payslips"),
      group("employeeSalary", "Employee salary", CircleDollarSign, [
        { label: "Component assignment", icon: Boxes, href: "/payroll/component-assignment" },
        { label: "Employee salary on hold", icon: PauseCircle, href: "/payroll/salary-hold" },
        { label: "Advance payments", icon: Wallet, href: "/payroll/advances" },
        { label: "Payments recovery", icon: Undo2, href: "/payroll/recoveries" },
      ]),
    ],
  },
  {
    key: "systemConfig",
    title: "System Config",
    entries: [
      group("organisation", "Organisation", Building2, [
        { label: "Company", icon: Building, href: "/company" },
        { label: "Branches", icon: GitBranch, href: "/branches" },
        { label: "Departments", icon: Layers, href: "/departments" },
      ]),
      group("employeeSettings", "Employee settings", UserCog, [
        { label: "Employee Category", icon: Tags, href: "/employee-categories" },
        { label: "Employment Type", icon: Briefcase, href: "/employment-types" },
        { label: "Shifts", icon: Clock, href: "/shifts" },
        { label: "Timetable", icon: CalendarDays, href: "/timetable" },
        { label: "Leave types", icon: ClipboardList, href: "/leave-types" },
      ]),
      group("payrollSettings", "Payroll settings", Settings2, [
        { label: "Pay components", icon: Boxes, href: "/settings/pay-components" },
        { label: "Statutory rates", icon: Percent, href: "/settings/statutory-rates" },
        { label: "Tax bands", icon: Receipt, href: "/settings/tax-bands" },
        { label: "Overtime rates", icon: Timer, href: "/settings/overtime" },
        { label: "Banks", icon: Landmark, href: "/settings/banks" },
      ]),
      group("userManagement", "User management", Shield, [
        { label: "Users", icon: UsersRound, href: "/users" },
        { label: "Roles & permissions", icon: KeyRound, href: "/roles" },
      ]),
    ],
  },
];

export type FlatNavLink = NavLink & { href: string; trail: string };

// Every page that exists, with its location in the menu, for search and the
// collapsed sidebar.
function canSee(access: AccessSnapshot | null | undefined, href?: string) {
  if (!href) {
    return false;
  }
  const feature = featureForPath(href);
  return Boolean(feature && can(access, feature, "view"));
}

export function visibleNavSections(access: AccessSnapshot | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry): NavEntry[] => {
      if (entry.kind === "item") {
        return canSee(access, entry.href) ? [entry] : [];
      }
      const items = entry.items.filter((link) => canSee(access, link.href));
      return items.length > 0 ? [{ ...entry, items }] : [];
    }),
  })).filter((section) => section.entries.length > 0);
}

export function flatNavLinks(): FlatNavLink[] {
  return NAV_SECTIONS.flatMap((section) =>
    section.entries.flatMap((entry) => {
      const links =
        entry.kind === "group"
          ? entry.items.map((link) => ({ ...link, trail: `${section.title} › ${entry.label}` }))
          : [{ ...entry, trail: section.title }];
      return links.filter((link): link is FlatNavLink => Boolean(link.href));
    }),
  );
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
