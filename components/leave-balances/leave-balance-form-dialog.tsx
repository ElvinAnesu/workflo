"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeaveBalanceAction } from "@/app/(app)/leave/actions";
import { formControlClass, formControlDisabledClass } from "@/components/form/form-control";
import { FormDialogFrame, FormField, sectionGridClass } from "@/components/form/form-dialog-frame";
import type { LeaveBalanceInput, LeaveBalanceListRow } from "@/components/leave-balances/leave-balance.types";

type LeaveBalanceFormDialogProps = {
  balance: LeaveBalanceListRow;
  onClose: () => void;
};

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function controlClass(invalid: boolean, disabled = false) {
  if (disabled) {
    return formControlDisabledClass;
  }
  return invalid ? invalidControlClass : formControlClass;
}

export function LeaveBalanceFormDialog({ balance, onClose }: LeaveBalanceFormDialogProps) {
  const router = useRouter();
  const [entitled, setEntitled] = useState(String(balance.entitled));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [entitledInvalid, setEntitledInvalid] = useState(false);
  const employeeLabel = `${balance.employeeName} (${balance.employeeCode})`;

  async function handleSubmit() {
    const parsedEntitled = entitled === "" ? null : Number(entitled);
    const invalid =
      parsedEntitled === null || !Number.isFinite(parsedEntitled) || parsedEntitled < 0 || parsedEntitled > 366;
    if (parsedEntitled === null) {
      setEntitledInvalid(true);
      setError("Employee, leave type and entitled days are required.");
      return;
    }
    if (invalid) {
      setEntitledInvalid(true);
      setError("Entitled days must be between 0 and 366.");
      return;
    }
    const input: LeaveBalanceInput = {
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      year: balance.year,
      entitled: parsedEntitled,
    };
    setPending(true);
    setError("");
    setEntitledInvalid(false);
    const result = await updateLeaveBalanceAction(input);
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
      title="Update leave balance"
      submitLabel={pending ? "Saving…" : "Save"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee *" className="sm:col-span-2">
          <input value={employeeLabel} disabled className={formControlDisabledClass} />
        </FormField>
        <FormField label="Leave type *">
          <input value={balance.leaveTypeName} disabled className={formControlDisabledClass} />
        </FormField>
        <FormField label="Year *">
          <input value={String(balance.year)} disabled className={formControlDisabledClass} />
        </FormField>
        <FormField label="Entitled (days) *">
          <input
            type="number"
            min={0}
            value={entitled}
            onChange={(event) => {
              const next = event.target.value;
              const parsed = next === "" ? null : Number(next);
              setEntitled(next);
              setEntitledInvalid(
                entitledInvalid &&
                  (parsed === null || !Number.isFinite(parsed) || parsed < 0 || parsed > 366),
              );
            }}
            className={controlClass(entitledInvalid)}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
