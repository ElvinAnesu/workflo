"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  saveCompany,
  useCompanyState,
  type CompanyDetails,
} from "@/components/company/company-store";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";

const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {label}
      {children}
    </label>
  );
}

export function CompanyForm() {
  const saved = useCompanyState();
  // Local edits override the saved values until the form is submitted.
  const [draft, setDraft] = useState<Partial<CompanyDetails>>({});
  const [savedMessage, setSavedMessage] = useState(false);
  const form = { ...saved, ...draft };

  function updateField(key: keyof CompanyDetails, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSavedMessage(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveCompany(form);
    setDraft({});
    setSavedMessage(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">Company</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FormSectionStrip title="Company details" />
        <div className={sectionGridClass}>
          <FormField label="Company name">
            <input
              value={form.companyName}
              onChange={(event) =>
                updateField("companyName", event.target.value)
              }
              className={formControlClass}
            />
          </FormField>
          <FormField label="Country">
            <input
              value={form.country}
              onChange={(event) => updateField("country", event.target.value)}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Address">
            <input
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              className={formControlClass}
            />
          </FormField>
        </div>
        <p className="px-4 text-xs text-zinc-500">
          The company name and address appear on payslips.
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-4 py-3">
        {savedMessage ? (
          <span className="text-xs text-emerald-700">Saved</span>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </form>
  );
}
