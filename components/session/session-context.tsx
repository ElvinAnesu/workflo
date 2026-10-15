"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionDTO } from "@/server/session";

const SessionContext = createContext<SessionDTO | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionDTO | null;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

// The signed-in user and their company, loaded from the database by the
// app layout. Null when no user is configured or found.
export function useSession() {
  return useContext(SessionContext);
}
