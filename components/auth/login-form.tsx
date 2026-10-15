"use client";

import { useState, type FormEvent } from "react";
import { loginAction } from "@/app/login/actions";
import { formControlClass } from "@/components/form/form-control";

const invalidClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setPending(true);
    const result = await loginAction(username, password, nextPath);
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3 rounded-md border border-zinc-200 bg-white p-5">
      <div>
        <h1 className="text-sm font-semibold text-zinc-800">Workflo</h1>
        <p className="mt-1 text-xs text-zinc-500">Sign in to continue.</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Username
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={submitted && !username.trim() ? invalidClass : formControlClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={submitted && !password ? invalidClass : formControlClass}
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
