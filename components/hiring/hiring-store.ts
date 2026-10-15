"use client";

import type {
  CandidateInput,
  CandidateRow,
  CandidateStatus,
  HiringRequestInput,
  HiringRequestRow,
} from "@/components/hiring/hiring.types";
import {
  createPersistentStore,
  nextSequence,
} from "@/components/store/persistent-store";

// Client store for the hiring workflow, persisted to localStorage; swap these
// functions for API calls when a backend exists.

type HiringState = {
  requests: HiringRequestRow[];
  candidates: CandidateRow[];
};

const store = createPersistentStore<HiringState>("workflo.hiring.v1", {
  requests: [],
  candidates: [],
});

const setState = store.setState;
const getState = store.getState;

export const useHiringState = store.useStore;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextId(prefix: string, ids: string[]) {
  return `${prefix}-${String(nextSequence(ids)).padStart(4, "0")}`;
}

const SEAT_STATUSES: CandidateStatus[] = [
  "Selected",
  "Hire confirmed",
  "Converted",
];

export function candidateFullName(candidate: CandidateRow) {
  return [candidate.firstName, candidate.middleName, candidate.lastName]
    .filter(Boolean)
    .join(" ");
}

export function requestLabel(request: HiringRequestRow) {
  return `${request.id} · ${request.jobTitle}${
    request.department ? ` (${request.department})` : ""
  }`;
}

export function seatsTaken(requestId: string, candidates: CandidateRow[]) {
  return candidates.filter(
    (candidate) =>
      candidate.requestId === requestId &&
      SEAT_STATUSES.includes(candidate.status),
  ).length;
}

function updateRequestById(
  id: string,
  update: (request: HiringRequestRow) => HiringRequestRow,
) {
  setState((current) => ({
    ...current,
    requests: current.requests.map((request) =>
      request.id === id ? update(request) : request,
    ),
  }));
}

function updateCandidateById(
  id: string,
  update: (candidate: CandidateRow) => CandidateRow,
) {
  setState((current) => ({
    ...current,
    candidates: current.candidates.map((candidate) =>
      candidate.id === id ? update(candidate) : candidate,
    ),
  }));
}

// Hiring requests

export function createHiringRequest(input: HiringRequestInput) {
  const request: HiringRequestRow = {
    ...input,
    id: nextId("REQ", getState().requests.map((item) => item.id)),
    requestedOn: today(),
    status: "Pending approval",
    decisionBy: "",
    decisionOn: "",
    decisionComment: "",
  };
  setState((current) => ({
    ...current,
    requests: [request, ...current.requests],
  }));
}

export function updateHiringRequest(id: string, input: HiringRequestInput) {
  updateRequestById(id, (request) =>
    request.status === "Pending approval" ? { ...request, ...input } : request,
  );
}

export function decideHiringRequest(
  id: string,
  decision: "Approved" | "Rejected",
  decisionBy: string,
  decisionComment: string,
) {
  updateRequestById(id, (request) =>
    request.status === "Pending approval"
      ? {
          ...request,
          status: decision,
          decisionBy,
          decisionComment,
          decisionOn: today(),
        }
      : request,
  );
}

export function cancelHiringRequest(id: string) {
  updateRequestById(id, (request) =>
    request.status === "Pending approval" || request.status === "Approved"
      ? { ...request, status: "Cancelled" }
      : request,
  );
}

// Candidates

export function addCandidate(input: CandidateInput) {
  const candidate: CandidateRow = {
    ...input,
    id: nextId("CAN", getState().candidates.map((item) => item.id)),
    addedOn: today(),
    status: "Shortlisted",
    startDate: "",
    employeeCode: "",
  };
  setState((current) => ({
    ...current,
    candidates: [candidate, ...current.candidates],
  }));
}

export function updateCandidate(id: string, input: CandidateInput) {
  updateCandidateById(id, (candidate) =>
    candidate.status === "Converted" ? candidate : { ...candidate, ...input },
  );
}

export function selectCandidate(id: string) {
  const candidate = getState().candidates.find((item) => item.id === id);
  const request = getState().requests.find(
    (item) => item.id === candidate?.requestId,
  );

  if (!candidate || !request || candidate.status !== "Shortlisted") {
    return;
  }
  if (seatsTaken(request.id, getState().candidates) >= request.positions) {
    return;
  }

  updateCandidateById(id, (current) => ({ ...current, status: "Selected" }));
}

export function unselectCandidate(id: string) {
  updateCandidateById(id, (candidate) =>
    candidate.status === "Selected"
      ? { ...candidate, status: "Shortlisted" }
      : candidate,
  );
}

export function setCandidateNotSelected(id: string) {
  updateCandidateById(id, (candidate) =>
    candidate.status === "Shortlisted" || candidate.status === "Selected"
      ? { ...candidate, status: "Not selected" }
      : candidate,
  );
}

export function confirmHire(id: string, startDate: string) {
  const candidate = getState().candidates.find((item) => item.id === id);
  const request = getState().requests.find(
    (item) => item.id === candidate?.requestId,
  );

  if (!candidate || !request || candidate.status !== "Selected") {
    return;
  }

  setState((current) => {
    const candidates = current.candidates.map((item) =>
      item.id === id
        ? { ...item, status: "Hire confirmed" as const, startDate }
        : item,
    );
    const confirmed = candidates.filter(
      (item) =>
        item.requestId === request.id &&
        (item.status === "Hire confirmed" || item.status === "Converted"),
    ).length;

    // Once every position is confirmed, close out the rest of the shortlist.
    return {
      ...current,
      candidates:
        confirmed >= request.positions
          ? candidates.map((item) =>
              item.requestId === request.id && item.status === "Shortlisted"
                ? { ...item, status: "Not selected" as const }
                : item,
            )
          : candidates,
    };
  });
}

export function markCandidateConverted(id: string, employeeCode: string) {
  const candidate = getState().candidates.find((item) => item.id === id);

  if (!candidate || candidate.status !== "Hire confirmed") {
    return;
  }

  setState((current) => {
    const candidates = current.candidates.map((item) =>
      item.id === id
        ? { ...item, status: "Converted" as const, employeeCode }
        : item,
    );
    const request = current.requests.find(
      (item) => item.id === candidate.requestId,
    );
    const converted = candidates.filter(
      (item) =>
        item.requestId === candidate.requestId && item.status === "Converted",
    ).length;
    const filled = request ? converted >= request.positions : false;

    return {
      candidates,
      requests: filled
        ? current.requests.map((item) =>
            item.id === candidate.requestId
              ? { ...item, status: "Filled" as const }
              : item,
          )
        : current.requests,
    };
  });
}
