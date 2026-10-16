import { redirect } from "next/navigation";
import { firstAllowedHref } from "@/lib/access";
import { getSession } from "@/server/session";

export default async function Home() {
  const session = await getSession();
  const next = firstAllowedHref(session?.access);
  if (next) {
    redirect(next);
  }

  return (
    <p className="text-sm text-zinc-600">You do not have access to any screens.</p>
  );
}
