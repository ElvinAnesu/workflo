"use client";

import { useSyncExternalStore } from "react";

// A small client store persisted to localStorage. Other tabs see changes
// through the `storage` event. Stands in for API calls while Workflo is
// frontend only.
export function createPersistentStore<T>(storageKey: string, emptyState: T) {
  let state: T | null = null;
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? { ...emptyState, ...(JSON.parse(raw) as T) } : emptyState;
    } catch {
      return emptyState;
    }
  }

  function getState(): T {
    if (state === null) {
      state = load();
    }
    return state;
  }

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function setState(updater: (current: T) => T) {
    state = updater(getState());
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode, quota); keep in memory.
    }
    notify();
  }

  function onStorage(event: StorageEvent) {
    if (event.key === storageKey) {
      state = load();
      notify();
    }
  }

  function subscribe(listener: () => void) {
    if (listeners.size === 0) {
      window.addEventListener("storage", onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener("storage", onStorage);
      }
    };
  }

  function useStore() {
    return useSyncExternalStore(subscribe, getState, () => emptyState);
  }

  return { getState, setState, useStore };
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function nextSequence(ids: string[]) {
  const numbers = ids.map((id) => Number(id.replace(/\D/g, "")) || 0);
  return Math.max(0, ...numbers) + 1;
}

export function prefixedId(prefix: string, ids: string[], width = 3) {
  return `${prefix}${String(nextSequence(ids)).padStart(width, "0")}`;
}
