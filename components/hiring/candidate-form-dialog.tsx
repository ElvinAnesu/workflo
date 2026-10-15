"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createHiringCandidateAction, updateHiringCandidateAction } from "@/app/(app)/hiring/actions";
import { formControlClass, formControlDisabledClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import {
  CANDIDATE_SOURCES,
  type HiringCandidateListRow,
  type HiringCandidateSaveInput,
  type HiringRequestOption,
} from "@/components/hiring/hiring.types";

type CandidateFormDialogProps = {
  candidate?: HiringCandidateListRow | null;
  defaultRequestId?: number | null;
  approvedRequests: HiringRequestOption[];
  onClose: () => void;
};

type FieldErrors = {
  request: boolean;
  firstName: boolean;
  lastName: boolean;
};

const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";
const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function controlClass(invalid: boolean, disabled = false) {
  if (disabled) {
    return formControlDisabledClass;
  }
  return invalid ? invalidControlClass : formControlClass;
}

function toId(value: string) {
  if (!value) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-600 ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

export function CandidateFormDialog({
  candidate,
  defaultRequestId,
  approvedRequests,
  onClose,
}: CandidateFormDialogProps) {
  const router = useRouter();
  const isUpdate = Boolean(candidate);
  const requestOptions =
    candidate && !approvedRequests.some((item) => item.id === candidate.requestId)
      ? [{ id: candidate.requestId, label: candidate.requestLabel }, ...approvedRequests]
      : approvedRequests;
  const [requestId, setRequestId] = useState(
    candidate ? String(candidate.requestId) : defaultRequestId ? String(defaultRequestId) : "",
  );
  const [firstName, setFirstName] = useState(candidate?.firstName ?? "");
  const [middleName, setMiddleName] = useState(candidate?.middleName ?? "");
  const [lastName, setLastName] = useState(candidate?.lastName ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [source, setSource] = useState(candidate?.source ?? "");
  const [cvFileName, setCvFileName] = useState(candidate?.cvFileName ?? "");
  const [notes, setNotes] = useState(candidate?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ request: false, firstName: false, lastName: false });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      request: !toId(requestId),
      firstName: !firstName.trim(),
      lastName: !lastName.trim(),
    };
    if (nextErrors.request || nextErrors.firstName || nextErrors.lastName) {
      setFieldErrors(nextErrors);
      if (nextErrors.request) {
        setError("Approved request is required.");
      } else if (nextErrors.firstName) {
        setError("First name is required.");
      } else {
        setError("Last name is required.");
      }
      return;
    }
    const input: HiringCandidateSaveInput = {
      requestId: toId(requestId),
      firstName,
      middleName,
      lastName,
      email,
      phone,
      source,
      cvFileName,
      notes,
    };
    setPending(true);
    setError("");
    setFieldErrors({ request: false, firstName: false, lastName: false });
    const result = candidate
      ? await updateHiringCandidateAction(candidate.id, input)
      : await createHiringCandidateAction(input);
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
        <h2 className="text-base font-semibold text-zinc-800">{isUpdate ? "Update candidate" : "Add candidate"}</h2>
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
        <FormSectionStrip title="Hiring request" />
        <div className={sectionGridClass}>
          <FormField label="Approved request *" className="sm:col-span-2">
            <select
              value={requestId}
              disabled={isUpdate}
              onChange={(event) => {
                const next = event.target.value;
                setRequestId(next);
                setFieldErrors((current) => ({ ...current, request: current.request && !toId(next) }));
              }}
              className={controlClass(fieldErrors.request, isUpdate)}
            >
              <option value="">Select</option>
              {requestOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </FormField>
          {requestOptions.length === 0 ? (
            <p className="self-end pb-1.5 text-xs text-amber-700 sm:col-span-2">
              No approved hiring requests yet. A request must be approved before candidates can be added.
            </p>
          ) : null}
        </div>
        <FormSectionStrip title="Candidate details" />
        <div className={sectionGridClass}>
          <FormField label="First name *">
            <input
              value={firstName}
              onChange={(event) => {
                const next = event.target.value;
                setFirstName(next);
                setFieldErrors((current) => ({ ...current, firstName: current.firstName && !next.trim() }));
              }}
              className={controlClass(fieldErrors.firstName)}
            />
          </FormField>
          <FormField label="Middle name">
            <input value={middleName} onChange={(event) => setMiddleName(event.target.value)} className={formControlClass} />
          </FormField>
          <FormField label="Last name *">
            <input
              value={lastName}
              onChange={(event) => {
                const next = event.target.value;
                setLastName(next);
                setFieldErrors((current) => ({ ...current, lastName: current.lastName && !next.trim() }));
              }}
              className={controlClass(fieldErrors.lastName)}
            />
          </FormField>
          <FormField label="Email">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={formControlClass} />
          </FormField>
          <FormField label="Phone number">
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={formControlClass} />
          </FormField>
          <FormField label="Source">
            <select value={source} onChange={(event) => setSource(event.target.value)} className={formControlClass}>
              <option value="">Select</option>
              {CANDIDATE_SOURCES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="CV">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(event) => setCvFileName(event.target.files?.[0]?.name ?? "")}
              className="text-xs text-zinc-600 file:mr-2 file:h-7 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-2 file:text-xs file:text-zinc-700"
            />
            {cvFileName ? <span className="truncate text-[11px] text-zinc-500">{cvFileName}</span> : null}
          </FormField>
          <FormField label="Notes" className="sm:col-span-4">
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none"
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
          {pending ? "Saving…" : isUpdate ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
