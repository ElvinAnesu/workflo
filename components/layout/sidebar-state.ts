// Open/closed state of the sidebar's sections and groups, kept in a cookie so
// the server renders the sidebar the way the user left it (no flash of
// everything expanded on reload).

export const SIDEBAR_STATE_COOKIE = "workflo-sidebar";

export type SidebarOpenState = Record<string, boolean>;

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseSidebarState(value: string | undefined): SidebarOpenState {
  if (!value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function saveSidebarState(state: SidebarOpenState) {
  document.cookie = `${SIDEBAR_STATE_COOKIE}=${encodeURIComponent(
    JSON.stringify(state),
  )}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
