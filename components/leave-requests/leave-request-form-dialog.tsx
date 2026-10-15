"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLeaveRequestAction,
  leaveRemainingAction,
  listRequestLeaveTypesAction,
  updateLeaveRequestAction,
} from "@/app/(app)/leave/actions";
import { formControlClass, formControlDisabledClass } from "@/components/form/form-control";
import { FormDialogFrame, FormField, sectionGridClass } from "@/components/form/form-dialog-frame";
import { RecordSelect } from "@/components/hr/record-select";
import type { LeaveEmployeeOption } from "@/components/leave-balances/leave-balance.types";
import { countWorkingDays } from "@/components/leave-requests/leave-calc";
import type { LeaveRequestInput, LeaveRequestListRow } from "@/components/leave-requests/leave-request.types";
import type { LeaveTypeOption } from "@/components/leave-types/leave-type.types";

type LeaveRequestFormDialogProps = {
  request?: LeaveRequestListRow | null;
  employees: LeaveEmployeeOption[];
  onClose: () => void;
};

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type FieldErrors = {
  employee: boolean;
  leaveType: boolean;
  start: boolean;
  end: boolean;
};

const clearErrors: FieldErrors = { employee: false, leaveType: false, start: false, end: false };

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

function toId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function withCurrent(options: LeaveEmployeeOption[], request?: LeaveRequestListRow | null) {
  if (!request || options.some((option) => option.id === request.employeeId)) {
    return options;
  }
  return [
    ...options,
    { id: request.employeeId, name: request.employeeName, employeeCode: request.employeeCode },
  ];
}

export function LeaveRequestFormDialog({
  request,
  employees,
  onClose,
}: LeaveRequestFormDialogProps) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(request ? String(request.employeeId) : "");
  const [leaveTypeId, setLeaveTypeId] = useState(request ? String(request.leaveTypeId) : "");
  const [startDate, setStartDate] = useState(request?.startDate ?? "");
  const [endDate, setEndDate] = useState(request?.endDate ?? "");
  const [note, setNote] = useState(request?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(clearErrors);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [remainingReady, setRemainingReady] = useState(false);
  const [requestTypes, setRequestTypes] = useState<LeaveTypeOption[]>([]);
  const people = withCurrent(employees, request);
  const days = countWorkingDays(startDate, endDate);
  const year = Number((startDate || new Date().toISOString()).slice(0, 4));

  useEffect(() => {
    const employee = toId(employeeId);
    if (!employee) {
      setRequestTypes([]);
      return;
    }
    let active = true;
    void listRequestLeaveTypesAction(employee, request?.leaveTypeId ?? null).then((types) => {
      if (!active) {
        return;
      }
      setRequestTypes(types);
      setLeaveTypeId((current) => (types.some((type) => String(type.id) === current) ? current : ""));
    });
    return () => {
      active = false;
    };
  }, [employeeId, request?.leaveTypeId]);

  useEffect(() => {
    const employee = toId(employeeId);
    const leaveType = toId(leaveTypeId);
    if (!employee || !leaveType || !Number.isInteger(year)) {
      setRemaining(null);
      setRemainingReady(false);
      return;
    }
    let active = true;
    setRemainingReady(false);
    void leaveRemainingAction({
      employeeId: employee,
      leaveTypeId: leaveType,
      year,
      excludeRequestId: request?.id ?? null,
    }).then((result) => {
      if (!active) {
        return;
      }
      setRemaining(result.remaining);
      setRemainingReady(true);
    });
    return () => {
      active = false;
    };
  }, [employeeId, leaveTypeId, request?.id, year]);

  async function handleSubmit() {
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      setFieldErrors({
        employee: !employeeId,
        leaveType: !leaveTypeId,
        start: !startDate,
        end: !endDate,
      });
      setError("Employee, leave type, start and end date are required.");
      return;
    }
    const input: LeaveRequestInput = {
      employeeId: toId(employeeId),
      leaveTypeId: toId(leaveTypeId),
      startDate,
      endDate,
      note,
    };
    setPending(true);
    setError("");
    setFieldErrors(clearErrors);
    const result = request
      ? await updateLeaveRequestAction(request.id, input)
      : await createLeaveRequestAction(input);
    setPending(false);
    if ("error" in result && result.error) {
      const dateError =
        result.error === "The end date cannot be before the start date." ||
        result.error === "The selected dates fall on a weekend only.";
      setFieldErrors({ ...clearErrors, start: dateError, end: dateError });
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const remainingHint =
    employeeId && leaveTypeId && remainingReady
      ? remaining === null
        ? `No ${year} balance set`
        : `${remaining} day${remaining === 1 ? "" : "s"} remaining in ${year}`
      : undefined;

  return (
    <FormDialogFrame
      title={request ? "Update leave request" : "New leave request"}
      submitLabel={pending ? "Saving…" : request ? "Save" : "Submit request"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee *" className="sm:col-span-2">
          <RecordSelect
            options={people.map((employee) => ({
              id: String(employee.id),
              label: `${employee.name} (${employee.employeeCode})`,
            }))}
            value={employeeId}
            className={controlClass(fieldErrors.employee)}
            onChange={(next) => {
              setEmployeeId(next);
              setFieldErrors((current) => ({ ...current, employee: current.employee && !next }));
            }}
          />
        </FormField>
        <FormField label="Leave type *" hint={remainingHint}>
          <RecordSelect
            options={requestTypes.map((item) => ({
              id: String(item.id),
              label: `${item.name} (${item.paidUnpaid.toLowerCase()})`,
            }))}
            value={leaveTypeId}
            className={controlClass(fieldErrors.leaveType)}
            onChange={(next) => {
              setLeaveTypeId(next);
              setFieldErrors((current) => ({ ...current, leaveType: current.leaveType && !next }));
            }}
            emptyHint={{ text: "No leave types yet. Add them first", href: "/leave-types" }}
          />
        </FormField>
        <div />
        <FormField label="Start *">
          <input
            type="date"
            value={startDate}
            onChange={(event) => {
              const next = event.target.value;
              setStartDate(next);
              setEndDate((current) => (current && current >= next ? current : next));
              setFieldErrors((current) => ({ ...current, start: current.start && !next, end: false }));
            }}
            className={controlClass(fieldErrors.start)}
          />
        </FormField>
        <FormField label="End *">
          <input
            type="date"
            min={startDate || undefined}
            value={endDate}
            onChange={(event) => {
              const next = event.target.value;
              setEndDate(next);
              setFieldErrors((current) => ({ ...current, end: current.end && !next }));
            }}
            className={controlClass(fieldErrors.end)}
          />
        </FormField>
        <FormField label="Days" hint="Working days, weekends excluded">
          <input value={days || ""} disabled className={formControlDisabledClass} />
        </FormField>
        <FormField label="Note" className="sm:col-span-4">
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none"
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
