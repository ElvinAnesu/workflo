"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmploymentTypeAction,
  updateEmploymentTypeAction,
} from "@/app/(app)/employment-types/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import type { EmploymentTypeListRow } from "@/components/employment-types/employment-type.types";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";

type EmploymentTypeFormDialogProps = {
  employmentType?: EmploymentTypeListRow | null;
  onClose: () => void;
};

export function EmploymentTypeFormDialog({
  employmentType,
  onClose,
}: EmploymentTypeFormDialogProps) {
  const isUpdate = Boolean(employmentType);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(employmentType?.name ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Employment type name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update employment type" : "Create employment type",
      message: isUpdate
        ? `Save changes to ${trimmedName}?`
        : `Create ${trimmedName}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    setPending(true);
    setError("");
    const input = { name: trimmedName };
    const result = employmentType
      ? await updateEmploymentTypeAction(employmentType.id, input)
      : await createEmploymentTypeAction(input);
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
      title={isUpdate ? "Update employment type" : "Add employment type"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employment type name *">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
