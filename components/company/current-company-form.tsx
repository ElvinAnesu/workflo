"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateCompanyAction } from "@/app/(app)/company/actions";
import type { CompanyListRow } from "@/components/company/company.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { FormField, sectionGridClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";

type CurrentCompanyFormProps = {
  company: CompanyListRow;
};

export function CurrentCompanyForm({ company }: CurrentCompanyFormProps) {
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(company.name);
  const [country, setCountry] = useState(company.country);
  const [address, setAddress] = useState(company.address);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }

    const ok = await confirm({
      title: "Update company",
      message: `Save changes to ${name.trim()}?`,
      confirmLabel: "Save",
    });
    if (!ok) {
      return;
    }

    setPending(true);
    setError("");
    const result = await updateCompanyAction(company.id, {
      name,
      country,
      address,
    });
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    setSavedMessage(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">Company</h2>
        <Link
          href="/manage-companies"
          className="text-xs font-medium text-[#1E40AF]"
        >
          Manage companies
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FormSectionStrip title="Company details" />
        <div className={sectionGridClass}>
          <FormField label="Company name">
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSavedMessage(false);
              }}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Country">
            <input
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setSavedMessage(false);
              }}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Address">
            <input
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setSavedMessage(false);
              }}
              className={formControlClass}
            />
          </FormField>
        </div>
        <p className="px-4 text-xs text-zinc-500">
          The company name and address appear on payslips.
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-4 py-3">
        {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : null}
        {savedMessage ? (
          <span className="text-xs text-emerald-700">Saved</span>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function CurrentCompanyEmpty() {
  return (
    <div className="flex min-h-full flex-col items-start justify-center gap-3 px-4">
      <h2 className="text-base font-semibold text-zinc-800">Company</h2>
      <p className="text-xs text-zinc-600">
        No current company. Create or activate one to see its details here.
      </p>
      <Link
        href="/manage-companies"
        className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
      >
        Manage companies
      </Link>
    </div>
  );
}
