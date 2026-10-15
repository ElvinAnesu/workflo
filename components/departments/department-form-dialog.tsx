"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDepartmentAction,
  updateDepartmentAction,
} from "@/app/(app)/departments/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import type { DepartmentListRow } from "@/components/departments/department.types";

type DepartmentFormDialogProps = {
  department?: DepartmentListRow | null;
  onClose: () => void;
};

export function DepartmentFormDialog({
  department,
  onClose,
}: DepartmentFormDialogProps) {
  const isUpdate = Boolean(department);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Department name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update department" : "Create department",
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
    const input = { name: trimmedName, code: code.trim() };
    const result = department
      ? await updateDepartmentAction(department.id, input)
      : await createDepartmentAction(input);
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
      title={isUpdate ? "Update department" : "Add department"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Department name *">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Description">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
