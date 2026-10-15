"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAttendanceAction, updateAttendanceAction } from "@/app/(app)/attendance/actions";
import {
  ATTENDANCE_STATUSES,
  type AttendanceEmployeeOption,
  type AttendanceInput,
  type AttendanceListRow,
  type AttendanceShiftOption,
  type AttendanceStatus,
} from "@/components/attendance/attendance.types";
import { formControlClass } from "@/components/form/form-control";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { RecordSelect } from "@/components/hr/record-select";

type AttendanceFormDialogProps = {
  record?: AttendanceListRow | null;
  shifts: AttendanceShiftOption[];
  employees: AttendanceEmployeeOption[];
  onClose: () => void;
};

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type FieldErrors = {
  workDate: boolean;
  employeeId: boolean;
  shiftId: boolean;
  status: boolean;
};

const clearFieldErrors: FieldErrors = {
  workDate: false,
  employeeId: false,
  shiftId: false,
  status: false,
};

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

function toId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function withCurrent(
  options: AttendanceEmployeeOption[],
  record?: AttendanceListRow | null,
) {
  if (!record || options.some((option) => option.id === record.employeeId)) {
    return options;
  }
  return [
    ...options,
    {
      id: record.employeeId,
      name: record.employeeName,
      employeeCode: record.employeeCode,
    },
  ];
}

export function AttendanceFormDialog({
  record,
  shifts,
  employees,
  onClose,
}: AttendanceFormDialogProps) {
  const isUpdate = Boolean(record);
  const router = useRouter();
  const [form, setForm] = useState({
    workDate: record?.workDate ?? "",
    employeeId: record?.employeeId ? String(record.employeeId) : "",
    shiftId: record?.shiftId ? String(record.shiftId) : "",
    status: (record?.status ?? "") as AttendanceStatus | "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(clearFieldErrors);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const employeeOptions = withCurrent(employees, record).map((employee) => ({
    id: String(employee.id),
    label: `${employee.name} (${employee.employeeCode})`,
  }));
  const shiftOptions = shifts.map((shift) => ({ id: String(shift.id), label: shift.name }));

  async function handleSubmit() {
    const missing: FieldErrors = {
      workDate: !form.workDate,
      employeeId: !form.employeeId,
      shiftId: !form.shiftId,
      status: !form.status,
    };
    if (missing.workDate || missing.employeeId || missing.shiftId || missing.status) {
      setFieldErrors(missing);
      setError("All fields are required.");
      return;
    }

    const input: AttendanceInput = {
      workDate: form.workDate,
      employeeId: toId(form.employeeId),
      shiftId: toId(form.shiftId),
      status: form.status,
    };

    setPending(true);
    setError("");
    setFieldErrors(clearFieldErrors);
    const result = record
      ? await updateAttendanceAction(record.id, input)
      : await createAttendanceAction(input);
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
      title={isUpdate ? "Update attendance" : "Add attendance"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Date *">
          <input
            type="date"
            value={form.workDate}
            onChange={(event) => {
              const workDate = event.target.value;
              setForm({ ...form, workDate });
              setFieldErrors((current) => ({ ...current, workDate: current.workDate && !workDate }));
            }}
            className={controlClass(fieldErrors.workDate)}
          />
        </FormField>
        <FormField label="Employee *">
          <RecordSelect
            options={employeeOptions}
            value={form.employeeId}
            onChange={(employeeId) => {
              setForm({ ...form, employeeId });
              setFieldErrors((current) => ({
                ...current,
                employeeId: current.employeeId && !employeeId,
              }));
            }}
            className={controlClass(fieldErrors.employeeId)}
          />
        </FormField>
        <FormField label="Shift *">
          <RecordSelect
            options={shiftOptions}
            value={form.shiftId}
            onChange={(shiftId) => {
              setForm({ ...form, shiftId });
              setFieldErrors((current) => ({ ...current, shiftId: current.shiftId && !shiftId }));
            }}
            className={controlClass(fieldErrors.shiftId)}
            emptyHint={{ text: "No shifts yet. Add them first", href: "/shifts" }}
          />
        </FormField>
        <FormField label="Status *">
          <select
            value={form.status}
            onChange={(event) => {
              const status = event.target.value as AttendanceStatus | "";
              setForm({ ...form, status });
              setFieldErrors((current) => ({ ...current, status: current.status && !status }));
            }}
            className={controlClass(fieldErrors.status)}
          >
            <option value="">Select</option>
            {ATTENDANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
