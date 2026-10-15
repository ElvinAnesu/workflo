"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createShiftAction, updateShiftAction } from "@/app/(app)/shifts/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { formControlClass } from "@/components/form/form-control";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { RecordSelect } from "@/components/hr/record-select";
import type {
  ShiftInput,
  ShiftListRow,
  ShiftLookupOption,
} from "@/components/shifts/shift.types";

type ShiftFormDialogProps = {
  shift?: ShiftListRow | null;
  branches: ShiftLookupOption[];
  departments: ShiftLookupOption[];
  onClose: () => void;
};

function withCurrent(
  options: ShiftLookupOption[],
  id: number | null,
  name: string,
) {
  if (id && name && name !== "All departments" && !options.some((option) => option.id === id)) {
    return [...options, { id, name }];
  }
  return options;
}

function toId(value: string) {
  if (!value) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type ShiftFieldErrors = {
  shiftName: boolean;
  branchId: boolean;
  startTime: boolean;
  endTime: boolean;
};

const clearFieldErrors: ShiftFieldErrors = {
  shiftName: false,
  branchId: false,
  startTime: false,
  endTime: false,
};

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

export function ShiftFormDialog({
  shift,
  branches,
  departments,
  onClose,
}: ShiftFormDialogProps) {
  const isUpdate = Boolean(shift);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [form, setForm] = useState({
    shiftName: shift?.shiftName ?? "",
    branchId: shift?.branchId ? String(shift.branchId) : "",
    departmentId: shift?.departmentId ? String(shift.departmentId) : "",
    startTime: shift?.startTime ?? "",
    endTime: shift?.endTime ?? "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ShiftFieldErrors>(clearFieldErrors);
  const [pending, setPending] = useState(false);

  const branchOptions = withCurrent(
    branches,
    shift?.branchId ?? null,
    shift?.branchName ?? "",
  ).map((item) => ({ id: String(item.id), label: item.name }));
  const departmentOptions = withCurrent(
    departments,
    shift?.departmentId ?? null,
    shift?.departmentName ?? "",
  ).map((item) => ({ id: String(item.id), label: item.name }));

  async function handleSubmit() {
    const shiftName = form.shiftName.trim();
    const missing: ShiftFieldErrors = {
      shiftName: !shiftName,
      branchId: !form.branchId,
      startTime: !form.startTime,
      endTime: !form.endTime,
    };
    if (missing.shiftName || missing.branchId || missing.startTime || missing.endTime) {
      setFieldErrors(missing);
      setError("Shift name, branch, start and end time are required.");
      return;
    }
    if (form.startTime === form.endTime) {
      setFieldErrors({ ...clearFieldErrors, startTime: true, endTime: true });
      setError("Start and end time cannot be the same.");
      return;
    }
    setFieldErrors(clearFieldErrors);

    const ok = await confirm({
      title: isUpdate ? "Update shift" : "Create shift",
      message: isUpdate ? `Save changes to ${shiftName}?` : `Create ${shiftName}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    const input: ShiftInput = {
      name: shiftName,
      branchId: toId(form.branchId),
      departmentId: toId(form.departmentId),
      startTime: form.startTime,
      endTime: form.endTime,
    };

    setPending(true);
    setError("");
    const result = shift
      ? await updateShiftAction(shift.id, input)
      : await createShiftAction(input);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  const overnight = form.startTime && form.endTime && form.endTime < form.startTime;

  return (
    <FormDialogFrame
      title={isUpdate ? "Update shift" : "Add shift"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Shift name *">
          <input
            value={form.shiftName}
            onChange={(event) => {
              setForm({ ...form, shiftName: event.target.value });
              setFieldErrors((current) => ({
                ...current,
                shiftName: current.shiftName && !event.target.value.trim(),
              }));
            }}
            className={controlClass(fieldErrors.shiftName)}
          />
        </FormField>
        <FormField label="Branch *">
          <RecordSelect
            options={branchOptions}
            value={form.branchId}
            onChange={(branchId) => {
              setForm({ ...form, branchId });
              setFieldErrors((current) => ({
                ...current,
                branchId: current.branchId && !branchId,
              }));
            }}
            className={controlClass(fieldErrors.branchId)}
            emptyHint={{ text: "No branches yet. Add them first", href: "/branches" }}
          />
        </FormField>
        <FormField label="Department">
          <RecordSelect
            options={departmentOptions}
            value={form.departmentId}
            onChange={(departmentId) => setForm({ ...form, departmentId })}
            placeholder="All departments"
          />
        </FormField>
        <div />
        <FormField label="Start *">
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => {
              const startTime = event.target.value;
              setForm({ ...form, startTime });
              setFieldErrors((current) => ({
                ...current,
                startTime:
                  current.startTime &&
                  (!startTime || (Boolean(form.endTime) && startTime === form.endTime)),
                endTime:
                  current.endTime &&
                  (!form.endTime || (Boolean(startTime) && startTime === form.endTime)),
              }));
            }}
            className={controlClass(fieldErrors.startTime)}
          />
        </FormField>
        <FormField label="End *" hint={overnight ? "Ends the next day (overnight shift)" : undefined}>
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => {
              const endTime = event.target.value;
              setForm({ ...form, endTime });
              setFieldErrors((current) => ({
                ...current,
                endTime: !endTime || (Boolean(form.startTime) && endTime === form.startTime),
                startTime:
                  current.startTime &&
                  (!form.startTime || (Boolean(endTime) && endTime === form.startTime)),
              }));
            }}
            className={controlClass(fieldErrors.endTime)}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
