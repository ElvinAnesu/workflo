import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  parseSidebarState,
  SIDEBAR_STATE_COOKIE,
} from "@/components/layout/sidebar-state";
import { SessionProvider } from "@/components/session/session-context";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { getSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const sidebarState = parseSidebarState(
    cookieStore.get(SIDEBAR_STATE_COOKIE)?.value,
  );
  const session = await getSession();
  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    redirect("/login");
  }

  return (
    <SessionProvider session={session}>
      <AppShell initialSidebarState={sidebarState}>{children}</AppShell>
    </SessionProvider>
  );
}
