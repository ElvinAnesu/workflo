"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import {
  createCompanyAction,
  updateCompanyAction,
} from "@/app/(app)/company/actions";
import type { CompanyListRow } from "@/components/company/company.types";

type CompanyFormDialogProps = {
  company?: CompanyListRow | null;
  onClose: () => void;
};

export function CompanyFormDialog({ company, onClose }: CompanyFormDialogProps) {
  const isUpdate = Boolean(company);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(company?.name ?? "");
  const [country, setCountry] = useState(company?.country ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update company" : "Create company",
      message: isUpdate
        ? `Save changes to ${name.trim()}?`
        : `Create ${name.trim()}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    setPending(true);
    setError("");
    const input = { name, country, address };
    const result = company
      ? await updateCompanyAction(company.id, input)
      : await createCompanyAction(input);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <FormDialogFrame
      title={isUpdate ? "Update company" : "Add company"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <FormSectionStrip title="Company details" />
      <div className={sectionGridClass}>
        <FormField label="Company name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Country">
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Address">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
