"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBranchAction,
  updateBranchAction,
} from "@/app/(app)/branches/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import type { BranchListRow } from "@/components/branches/branch.types";

type BranchFormDialogProps = {
  branch?: BranchListRow | null;
  onClose: () => void;
};

export function BranchFormDialog({ branch, onClose }: BranchFormDialogProps) {
  const isUpdate = Boolean(branch);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [name, setName] = useState(branch?.name ?? "");
  const [location, setLocation] = useState(branch?.location ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Branch name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update branch" : "Create branch",
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
    const input = { name: trimmedName, location: location.trim() };
    const result = branch
      ? await updateBranchAction(branch.id, input)
      : await createBranchAction(input);
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
      title={isUpdate ? "Update branch" : "Add branch"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Branch name *">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Location">
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
