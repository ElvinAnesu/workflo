import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/server/session";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/employees";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = safeNext(firstParam(params.next));
  const session = await getSession();
  if (session) {
    redirect(nextPath);
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[#F4F6FB] p-4">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
