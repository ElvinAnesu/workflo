"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  cancelHiringRequestAction,
  confirmHiringCandidateAction,
  decideHiringRequestAction,
  getHiringRequestAction,
  markHiringCandidateConvertedAction,
  rejectHiringCandidateAction,
  selectHiringCandidateAction,
  unselectHiringCandidateAction,
} from "@/app/(app)/hiring/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { EmployeeRecordDialog } from "@/components/employees/employee-record-dialog";
import { formControlClass } from "@/components/form/form-control";
import { RowActions } from "@/components/table/table-actions";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { CandidateFormDialog } from "@/components/hiring/candidate-form-dialog";
import { HiringRequestFormDialog } from "@/components/hiring/hiring-request-form-dialog";
import { HiringStatusBadge } from "@/components/hiring/hiring-status-badge";
import type {
  HiringCandidateListRow,
  HiringFormOptions,
  HiringRequestListRow,
} from "@/components/hiring/hiring.types";

type HiringRequestDetailDialogProps = {
  requestId: number;
  options: HiringFormOptions;
  onClose: () => void;
};

const sectionGridClass = "grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-4";
const linkButtonClass =
  "text-xs font-medium text-[#1E40AF] disabled:cursor-not-allowed disabled:text-zinc-400";
const dangerLinkButtonClass = "text-xs font-medium text-red-600";

function ReadOnlyField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs whitespace-pre-wrap text-zinc-800">{children || "—"}</span>
    </div>
  );
}

export function HiringRequestDetailDialog({ requestId, options, onClose }: HiringRequestDetailDialogProps) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const [request, setRequest] = useState<HiringRequestListRow | null>(null);
  const [candidates, setCandidates] = useState<HiringCandidateListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [decisionBy, setDecisionBy] = useState("");
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [startDates, setStartDates] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    void getHiringRequestAction(requestId).then((detail) => {
      if (!active) {
        return;
      }
      setRequest(detail?.request ?? null);
      setCandidates(detail?.candidates ?? []);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [requestId, reloadKey]);

  function reload() {
    setReloadKey((current) => current + 1);
    router.refresh();
  }

  function reopen() {
    overlay.show(
      <HiringRequestDetailDialog
        key={`${requestId}-${Date.now()}`}
        requestId={requestId}
        options={options}
        onClose={overlay.close}
      />,
    );
  }

  if (!loaded) {
    return <p className="p-4 text-xs text-zinc-500">Loading hiring request…</p>;
  }

  if (!request) {
    return <p className="p-4 text-xs text-zinc-500">Hiring request not found.</p>;
  }

  const current = request;
  const taken = current.seatsTaken;
  const seatsFull = taken >= current.positions;
  const isPending = current.status === "Pending approval";
  const isApproved = current.status === "Approved";
  const canCancel = isPending || isApproved;

  async function handleDecision(decision: "Approved" | "Rejected") {
    if (!decisionBy.trim()) {
      setDecisionError("Enter the approver's name.");
      return;
    }
    if (decision === "Rejected" && !decisionComment.trim()) {
      setDecisionError("Add a comment explaining the rejection.");
      return;
    }
    setDecisionError("");
    const result = await decideHiringRequestAction(current.id, decision, decisionBy.trim(), decisionComment.trim());
    if ("error" in result && result.error) {
      setDecisionError(result.error);
      return;
    }
    reload();
  }

  async function runAction(action: () => Promise<{ error: string } | { id: number }>) {
    setActionError("");
    const result = await action();
    if ("error" in result && result.error) {
      setActionError(result.error);
      return;
    }
    reload();
  }

  function handleConvert(candidate: HiringCandidateListRow) {
    overlay.show(
      <EmployeeRecordDialog
        key={`convert-${candidate.id}`}
        employee={null}
        nextCode={options.nextEmployeeCode}
        branches={options.branches}
        departments={options.departments}
        employmentTypes={options.employmentTypes}
        employeeCategories={options.employeeCategories}
        initialValues={{
          firstName: candidate.firstName,
          middleName: candidate.middleName,
          lastName: candidate.lastName,
          email: candidate.email,
          phoneNumber: candidate.phone,
          designation: current.jobTitle,
          departmentId: String(current.departmentId),
          branchId: current.branchId ? String(current.branchId) : "",
          employmentTypeId: current.employmentTypeId ? String(current.employmentTypeId) : "",
          employeeCategoryId: current.employeeCategoryId ? String(current.employeeCategoryId) : "",
          joinDate: candidate.startDate,
          status: "Active",
        }}
        onCreated={async (created) => {
          const result = await markHiringCandidateConvertedAction(candidate.id, created.id);
          if ("error" in result && result.error) {
            return { error: result.error };
          }
          return;
        }}
        onClose={reopen}
      />,
    );
  }

  function renderCandidateActions(candidate: HiringCandidateListRow) {
    switch (candidate.status) {
      case "Shortlisted":
        return (
          <RowActions>
            <button
              type="button"
              disabled={!isApproved || seatsFull}
              title={seatsFull ? "All positions already have a candidate" : ""}
              onClick={() => {
                void runAction(() => selectHiringCandidateAction(candidate.id));
              }}
              className={linkButtonClass}
            >
              Select
            </button>
            <button
              type="button"
              onClick={() => {
                void runAction(() => rejectHiringCandidateAction(candidate.id));
              }}
              className={dangerLinkButtonClass}
            >
              Not selected
            </button>
          </RowActions>
        );
      case "Selected":
        return (
          <RowActions>
            <label className="flex flex-col gap-1 px-3 py-1.5 text-[11px] text-zinc-500">
              Start date
              <input
                type="date"
                aria-label="Start date"
                value={startDates[candidate.id] ?? current.desiredStartDate}
                onChange={(event) =>
                  setStartDates((dates) => ({
                    ...dates,
                    [candidate.id]: event.target.value,
                  }))
                }
                className={formControlClass}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void runAction(() =>
                  confirmHiringCandidateAction(candidate.id, startDates[candidate.id] ?? current.desiredStartDate),
                );
              }}
              className={linkButtonClass}
            >
              Confirm hire
            </button>
            <button
              type="button"
              onClick={() => {
                void runAction(() => unselectHiringCandidateAction(candidate.id));
              }}
              className="text-xs font-medium text-zinc-500"
            >
              Undo
            </button>
          </RowActions>
        );
      case "Hire confirmed":
        return (
          <RowActions>
            <button type="button" onClick={() => handleConvert(candidate)} className={linkButtonClass}>
              Convert to employee
            </button>
          </RowActions>
        );
      case "Converted":
        return <span className="text-xs text-emerald-700">Employee {candidate.employeeCode}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-base font-semibold text-zinc-800">
            {current.number} · {current.jobTitle}
          </h2>
          <HiringStatusBadge status={current.status} />
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FormSectionStrip title="Request" />
        <div className={sectionGridClass}>
          <ReadOnlyField label="Department">{current.departmentName}</ReadOnlyField>
          <ReadOnlyField label="Branch">{current.branchName}</ReadOnlyField>
          <ReadOnlyField label="Positions">{current.positions}</ReadOnlyField>
          <ReadOnlyField label="Reason">{current.reason}</ReadOnlyField>
          <ReadOnlyField label="Employment type">{current.employmentTypeName}</ReadOnlyField>
          <ReadOnlyField label="Employee category">{current.employeeCategoryName}</ReadOnlyField>
          <ReadOnlyField label="Desired start date">{current.desiredStartDate}</ReadOnlyField>
          <ReadOnlyField label="Requested by">{`${current.requestedBy} on ${current.requestedOn}`}</ReadOnlyField>
          <ReadOnlyField label="Justification" className="sm:col-span-4">
            {current.justification}
          </ReadOnlyField>
        </div>

        <FormSectionStrip title="Approval" />
        {isPending ? (
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Approver
              <input value={decisionBy} onChange={(event) => setDecisionBy(event.target.value)} className={formControlClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 sm:col-span-3">
              Comment
              <input
                value={decisionComment}
                onChange={(event) => setDecisionComment(event.target.value)}
                placeholder="Required when rejecting"
                className={formControlClass}
              />
            </label>
            <div className="flex items-center gap-2 sm:col-span-4">
              <button
                type="button"
                onClick={() => {
                  void handleDecision("Approved");
                }}
                className="inline-flex h-9 items-center rounded-md bg-[#22C55E] px-3 text-sm font-medium text-white"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDecision("Rejected");
                }}
                className="inline-flex h-9 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white"
              >
                Reject
              </button>
              {decisionError ? <span className="text-xs text-red-600">{decisionError}</span> : null}
            </div>
          </div>
        ) : current.decisionOn ? (
          <div className={sectionGridClass}>
            <ReadOnlyField label="Decision">{current.status === "Rejected" ? "Rejected" : "Approved"}</ReadOnlyField>
            <ReadOnlyField label="By">{current.decisionBy}</ReadOnlyField>
            <ReadOnlyField label="On">{current.decisionOn}</ReadOnlyField>
            <ReadOnlyField label="Comment">{current.decisionComment}</ReadOnlyField>
          </div>
        ) : (
          <p className="p-4 text-xs text-zinc-500">Cancelled before a decision was made.</p>
        )}

        <FormSectionStrip title="Candidates" />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-600">
              {isPending
                ? "Candidates can be added once the request is approved."
                : `${taken} of ${current.positions} position${current.positions === 1 ? "" : "s"} selected`}
            </p>
            {isApproved ? (
              <button
                type="button"
                onClick={() =>
                  overlay.show(
                    <CandidateFormDialog
                      key={`add-${Date.now()}`}
                      defaultRequestId={current.id}
                      approvedRequests={options.approvedRequests}
                      onClose={reopen}
                    />,
                  )
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#172554] px-3 text-xs font-medium text-white"
              >
                <Plus className="size-3.5" />
                Add candidate
              </button>
            ) : null}
          </div>
          {actionError ? <p className="text-xs text-red-600">{actionError}</p> : null}
          {candidates.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="min-w-full border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    {["Candidate", "Contact", "Source", "CV", "Start date", "Status", "Actions"].map((label) => (
                      <th key={label} scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-800">{candidate.name}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-600">
                        {[candidate.email, candidate.phone].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-600">{candidate.source || "—"}</td>
                      <td className="max-w-40 truncate px-3 py-2.5 text-xs text-zinc-600">{candidate.cvFileName || "—"}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-600">{candidate.startDate || "—"}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <HiringStatusBadge status={candidate.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{renderCandidateActions(candidate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isPending ? null : (
            <p className="rounded-md border border-zinc-200 px-3 py-8 text-center text-xs text-zinc-500">No candidates yet</p>
          )}
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t border-zinc-200 px-4 py-3">
        <div className="flex gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={() => {
                void runAction(() => cancelHiringRequestAction(current.id));
              }}
              className="inline-flex h-9 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-600"
            >
              Cancel request
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {isPending ? (
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <HiringRequestFormDialog
                    key={`edit-${current.id}`}
                    request={current}
                    options={options}
                    onClose={reopen}
                  />,
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
            >
              Edit request
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
