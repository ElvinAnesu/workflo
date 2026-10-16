import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  parseSidebarState,
  SIDEBAR_STATE_COOKIE,
} from "@/components/layout/sidebar-state";
import { SessionProvider } from "@/components/session/session-context";
import { can, featureForPath, firstAllowedHref } from "@/lib/access";
import { getSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const sidebarState = parseSidebarState(
    cookieStore.get(SIDEBAR_STATE_COOKIE)?.value,
  );
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const pathname = (await headers()).get("x-pathname") ?? "";
  const feature = featureForPath(pathname);
  if (feature && !can(session.access, feature, "view")) {
    redirect(firstAllowedHref(session.access) ?? "/");
  }

  return (
    <SessionProvider session={session}>
      <AppShell initialSidebarState={sidebarState}>{children}</AppShell>
    </SessionProvider>
  );
}
