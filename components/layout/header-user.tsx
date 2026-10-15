"use client";

import { useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { useSession } from "@/components/session/session-context";

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters ?? "?").toUpperCase();
}

export function HeaderUser() {
  const user = useSession()?.user;
  const [open, setOpen] = useState(false);
  const label = user ? `${user.fullName} (${user.username})` : "No user";

  return (
    <div className="relative ml-1">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex size-9 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700"
      >
        {user ? initials(user.fullName) : "?"}
        {user ? (
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
        ) : null}
      </button>
      {open && user ? (
        <div className="absolute right-0 top-11 z-30 w-36 rounded-md border border-zinc-200 bg-white py-1 shadow-sm">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
