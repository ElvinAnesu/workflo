"use client";

import { useSyncExternalStore } from "react";
import type {
  FeedbackResponse,
  FeedbackResponseInput,
  FeedbackReview,
  FeedbackReviewInput,
} from "@/components/feedback-360/feedback-360.types";

// Client-side store for 360 feedback, persisted to localStorage so that a
// rater opening the anonymous link in another tab writes to the same data the
// HR view reads. Swap these functions for API calls when a backend exists.

type Feedback360State = {
  reviews: FeedbackReview[];
  responses: FeedbackResponse[];
};

const STORAGE_KEY = "workflo.feedback360.v1";
const emptyState: Feedback360State = { reviews: [], responses: [] };

let state: Feedback360State | null = null;
const listeners = new Set<() => void>();

function load(): Feedback360State {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Feedback360State) : emptyState;
  } catch {
    return emptyState;
  }
}

function getState() {
  if (!state) {
    state = load();
  }
  return state;
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(updater: (current: Feedback360State) => Feedback360State) {
  state = updater(getState());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, quota); keep in-memory state.
  }
  notify();
}

function onStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY) {
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

export function useFeedback360State() {
  return useSyncExternalStore(subscribe, getState, () => emptyState);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function randomToken() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function nextNumber(ids: string[]) {
  const numbers = ids.map((id) => Number(id.split("-").pop()) || 0);
  return Math.max(0, ...numbers) + 1;
}

export function feedbackLink(token: string) {
  return `${window.location.origin}/f/${token}`;
}

export function createReview(input: FeedbackReviewInput) {
  const current = getState();
  const review: FeedbackReview = {
    ...input,
    id: `FB-${String(nextNumber(current.reviews.map((item) => item.id))).padStart(4, "0")}`,
    token: randomToken(),
    status: "Collecting",
    createdOn: today(),
  };
  setState((existing) => ({
    ...existing,
    reviews: [review, ...existing.reviews],
  }));
  return review;
}

export function setReviewStatus(id: string, status: FeedbackReview["status"]) {
  setState((current) => ({
    ...current,
    reviews: current.reviews.map((review) =>
      review.id === id ? { ...review, status } : review,
    ),
  }));
}

export function deleteReview(id: string) {
  setState((current) => ({
    reviews: current.reviews.filter((review) => review.id !== id),
    responses: current.responses.filter(
      (response) => response.reviewId !== id,
    ),
  }));
}

export function submitResponse(token: string, input: FeedbackResponseInput) {
  const review = getState().reviews.find((item) => item.token === token);

  if (!review || review.status !== "Collecting") {
    return false;
  }

  setState((current) => ({
    ...current,
    responses: [
      ...current.responses,
      {
        ...input,
        id: `RSP-${nextNumber(current.responses.map((item) => item.id))}`,
        reviewId: review.id,
        submittedOn: today(),
      },
    ],
  }));
  return true;
}
