"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployeeCategoryAction,
  updateEmployeeCategoryAction,
} from "@/app/(app)/employee-categories/actions";
import type { EmployeeCategoryListRow } from "@/components/employee-categories/employee-category.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";

type EmployeeCategoryFormDialogProps = {
  employeeCategory?: EmployeeCategoryListRow | null;
  onClose: () => void;
};

export function EmployeeCategoryFormDialog({
  employeeCategory,
  onClose,
}: EmployeeCategoryFormDialogProps) {
  const isUpdate = Boolean(employeeCategory);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(employeeCategory?.name ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Employee category name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update employee category" : "Create employee category",
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
    const result = employeeCategory
      ? await updateEmployeeCategoryAction(employeeCategory.id, input)
      : await createEmployeeCategoryAction(input);
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
      title={isUpdate ? "Update employee category" : "Add employee category"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee category name *">
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
