"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createHiringRequestAction, updateHiringRequestAction } from "@/app/(app)/hiring/actions";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import {
  HIRING_REQUEST_REASONS,
  type HiringFormOptions,
  type HiringLookupOption,
  type HiringRequestListRow,
  type HiringRequestReason,
  type HiringRequestSaveInput,
} from "@/components/hiring/hiring.types";

type HiringRequestFormDialogProps = {
  request?: HiringRequestListRow | null;
  options: HiringFormOptions;
  onClose: () => void;
};

type HiringRequestFormState = {
  jobTitle: string;
  departmentId: string;
  branchId: string;
  employmentTypeId: string;
  employeeCategoryId: string;
  positions: string;
  reason: HiringRequestReason | "";
  justification: string;
  desiredStartDate: string;
  requestedBy: string;
};

type FieldErrors = {
  jobTitle: boolean;
  department: boolean;
  positions: boolean;
  reason: boolean;
  requestedBy: boolean;
  justification: boolean;
};

const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";
const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

const clearErrors: FieldErrors = {
  jobTitle: false,
  department: false,
  positions: false,
  reason: false,
  requestedBy: false,
  justification: false,
};

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

function toId(value: string) {
  if (!value) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function withCurrent(options: HiringLookupOption[], id: number | null, name: string) {
  if (id && !options.some((option) => option.id === id)) {
    return [...options, { id, name: name || String(id) }];
  }
  return options;
}

function createForm(request?: HiringRequestListRow | null): HiringRequestFormState {
  if (request) {
    return {
      jobTitle: request.jobTitle,
      departmentId: String(request.departmentId),
      branchId: request.branchId ? String(request.branchId) : "",
      employmentTypeId: request.employmentTypeId ? String(request.employmentTypeId) : "",
      employeeCategoryId: request.employeeCategoryId ? String(request.employeeCategoryId) : "",
      positions: String(request.positions),
      reason: request.reason,
      justification: request.justification,
      desiredStartDate: request.desiredStartDate,
      requestedBy: request.requestedBy,
    };
  }
  return {
    jobTitle: "",
    departmentId: "",
    branchId: "",
    employmentTypeId: "",
    employeeCategoryId: "",
    positions: "1",
    reason: "New position",
    justification: "",
    desiredStartDate: "",
    requestedBy: "",
  };
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-600 ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

export function HiringRequestFormDialog({ request, options, onClose }: HiringRequestFormDialogProps) {
  const router = useRouter();
  const isUpdate = Boolean(request);
  const [form, setForm] = useState<HiringRequestFormState>(() => createForm(request));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(clearErrors);
  const departments = withCurrent(options.departments, request?.departmentId ?? null, request?.departmentName ?? "");
  const branches = withCurrent(options.branches, request?.branchId ?? null, request?.branchName ?? "");
  const employmentTypes = withCurrent(
    options.employmentTypes,
    request?.employmentTypeId ?? null,
    request?.employmentTypeName ?? "",
  );
  const employeeCategories = withCurrent(
    options.employeeCategories,
    request?.employeeCategoryId ?? null,
    request?.employeeCategoryName ?? "",
  );

  function updateField<K extends keyof HiringRequestFormState>(key: K, value: HiringRequestFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const positions = form.positions.trim() === "" ? null : Number(form.positions);
    const positionsInvalid = positions === null || !Number.isInteger(positions) || positions < 1;
    const nextErrors: FieldErrors = {
      jobTitle: !form.jobTitle.trim(),
      department: !toId(form.departmentId),
      positions: positionsInvalid,
      reason: !form.reason,
      requestedBy: !form.requestedBy.trim(),
      justification: !form.justification.trim(),
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      if (nextErrors.jobTitle) {
        setError("Job title is required.");
      } else if (nextErrors.department) {
        setError("Department is required.");
      } else if (nextErrors.positions) {
        setError("Positions must be at least 1.");
      } else if (nextErrors.reason) {
        setError("Reason is required.");
      } else if (nextErrors.requestedBy) {
        setError("Requested by is required.");
      } else {
        setError("Justification is required.");
      }
      return;
    }
    const input: HiringRequestSaveInput = {
      jobTitle: form.jobTitle,
      departmentId: toId(form.departmentId),
      branchId: toId(form.branchId),
      employmentTypeId: toId(form.employmentTypeId),
      employeeCategoryId: toId(form.employeeCategoryId),
      positions,
      reason: form.reason,
      justification: form.justification,
      desiredStartDate: form.desiredStartDate,
      requestedBy: form.requestedBy,
    };
    setPending(true);
    setError("");
    setFieldErrors(clearErrors);
    const result = request ? await updateHiringRequestAction(request.id, input) : await createHiringRequestAction(input);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">
          {isUpdate ? `Update hiring request ${request?.number}` : "New hiring request"}
        </h2>
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
        <FormSectionStrip title="Position" />
        <div className={sectionGridClass}>
          <FormField label="Job title *">
            <input
              value={form.jobTitle}
              onChange={(event) => {
                const next = event.target.value;
                updateField("jobTitle", next);
                setFieldErrors((current) => ({ ...current, jobTitle: current.jobTitle && !next.trim() }));
              }}
              className={controlClass(fieldErrors.jobTitle)}
            />
          </FormField>
          <FormField label="Department *">
            <select
              value={form.departmentId}
              onChange={(event) => {
                const next = event.target.value;
                updateField("departmentId", next);
                setFieldErrors((current) => ({ ...current, department: current.department && !toId(next) }));
              }}
              className={controlClass(fieldErrors.department)}
            >
              <option value="">Select</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Branch">
            <select
              value={form.branchId}
              onChange={(event) => updateField("branchId", event.target.value)}
              className={formControlClass}
            >
              <option value="">Select</option>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Number of positions *">
            <input
              type="number"
              min={1}
              value={form.positions}
              onChange={(event) => {
                const next = event.target.value;
                const parsed = next.trim() === "" ? null : Number(next);
                updateField("positions", next);
                setFieldErrors((current) => ({
                  ...current,
                  positions: current.positions && (parsed === null || !Number.isInteger(parsed) || parsed < 1),
                }));
              }}
              className={controlClass(fieldErrors.positions)}
            />
          </FormField>
          <FormField label="Employment type">
            <select
              value={form.employmentTypeId}
              onChange={(event) => updateField("employmentTypeId", event.target.value)}
              className={formControlClass}
            >
              <option value="">Select</option>
              {employmentTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Employee category">
            <select
              value={form.employeeCategoryId}
              onChange={(event) => updateField("employeeCategoryId", event.target.value)}
              className={formControlClass}
            >
              <option value="">Select</option>
              {employeeCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Desired start date">
            <input
              type="date"
              value={form.desiredStartDate}
              onChange={(event) => updateField("desiredStartDate", event.target.value)}
              className={formControlClass}
            />
          </FormField>
        </div>
        <FormSectionStrip title="Justification" />
        <div className={sectionGridClass}>
          <FormField label="Requested by (HOD) *">
            <input
              value={form.requestedBy}
              onChange={(event) => {
                const next = event.target.value;
                updateField("requestedBy", next);
                setFieldErrors((current) => ({ ...current, requestedBy: current.requestedBy && !next.trim() }));
              }}
              className={controlClass(fieldErrors.requestedBy)}
            />
          </FormField>
          <FormField label="Reason *">
            <select
              value={form.reason}
              onChange={(event) => {
                const next = event.target.value as HiringRequestReason;
                updateField("reason", next);
                setFieldErrors((current) => ({ ...current, reason: current.reason && !next }));
              }}
              className={controlClass(fieldErrors.reason)}
            >
              {HIRING_REQUEST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Why is this hire needed? *" className="sm:col-span-4">
            <textarea
              rows={3}
              value={form.justification}
              onChange={(event) => {
                const next = event.target.value;
                updateField("justification", next);
                setFieldErrors((current) => ({
                  ...current,
                  justification: current.justification && !next.trim(),
                }));
              }}
              className={
                fieldErrors.justification
                  ? "rounded-md border border-red-500 bg-red-50 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                  : "rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none"
              }
            />
          </FormField>
        </div>
        {error ? <p className="px-4 pb-3 text-xs text-red-600">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          {pending ? "Saving…" : isUpdate ? "Save" : "Submit for approval"}
        </button>
      </div>
    </form>
  );
}
