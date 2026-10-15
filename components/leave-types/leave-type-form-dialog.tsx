"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLeaveTypeAction, listLeaveEmployeesAction, updateLeaveTypeAction } from "@/app/(app)/leave-types/actions";
import { formControlClass } from "@/components/form/form-control";
import { FormDialogFrame, FormField, sectionGridClass } from "@/components/form/form-dialog-frame";
import type {
  LeaveAppliesTo,
  LeaveDepartmentOption,
  LeaveEmployeeChoice,
  LeaveEmployeeFilter,
  LeavePaidUnpaid,
  LeaveTypeInput,
  LeaveTypeListRow,
} from "@/components/leave-types/leave-type.types";

type LeaveTypeFormDialogProps = {
  leaveType?: LeaveTypeListRow | null;
  departments: LeaveDepartmentOption[];
  onClose: () => void;
};

type DepartmentFilter = "all" | "none" | number;

function employeeQuery(
  departmentFilter: DepartmentFilter,
  includeIds: number[],
  search: string,
): LeaveEmployeeFilter {
  const shared = { includeIds, search };
  if (departmentFilter === "none") {
    return { filter: "none", departmentId: null, ...shared };
  }
  if (departmentFilter === "all") {
    return { filter: "all", departmentId: null, ...shared };
  }
  return { filter: "department", departmentId: departmentFilter, ...shared };
}

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type FieldErrors = {
  name: boolean;
  days: boolean;
  paid: boolean;
  applies: boolean;
  employees: boolean;
};

const clearErrors: FieldErrors = { name: false, days: false, paid: false, applies: false, employees: false };

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

export function LeaveTypeFormDialog({ leaveType, departments, onClose }: LeaveTypeFormDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(leaveType?.name ?? "");
  const [daysPerYear, setDaysPerYear] = useState(leaveType ? String(leaveType.daysPerYear) : "");
  const [paidUnpaid, setPaidUnpaid] = useState<LeavePaidUnpaid | "">(leaveType?.paidUnpaid ?? "");
  const [appliesTo, setAppliesTo] = useState<LeaveAppliesTo | "">(leaveType?.appliesTo ?? "");
  const [selectedIds, setSelectedIds] = useState<number[]>(leaveType?.employeeIds ?? []);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [appliedEmployeeSearch, setAppliedEmployeeSearch] = useState("");
  const [employeeRows, setEmployeeRows] = useState<LeaveEmployeeChoice[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(clearErrors);
  const headerRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const includeKey = (leaveType?.employeeIds ?? []).join(",");
  const visibleIds = employeeRows.map((employee) => employee.id);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisible = visibleIds.some((id) => selectedIds.includes(id)) && !allVisible;

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = someVisible;
    }
  }, [someVisible]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedEmployeeSearch(employeeSearch.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [employeeSearch]);

  useEffect(() => {
    if (appliesTo !== "Assign as needed") {
      return;
    }
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const ids = includeKey ? includeKey.split(",").map(Number) : [];
    setEmployeesLoading(true);
    void listLeaveEmployeesAction(employeeQuery(departmentFilter, ids, appliedEmployeeSearch))
      .then((rows) => {
        if (requestId.current !== currentRequest) {
          return;
        }
        setEmployeeRows(rows);
        setEmployeesLoading(false);
      })
      .catch(() => {
        if (requestId.current !== currentRequest) {
          return;
        }
        setEmployeeRows([]);
        setEmployeesLoading(false);
      });
  }, [appliedEmployeeSearch, appliesTo, departmentFilter, includeKey]);

  async function handleSubmit() {
    const trimmed = name.trim();
    const days = daysPerYear === "" ? null : Number(daysPerYear);
    const daysInvalid = days !== null && (!Number.isInteger(days) || days < 0 || days > 366);
    if (!trimmed || days === null || !paidUnpaid || !appliesTo) {
      setFieldErrors({
        name: !trimmed,
        days: days === null,
        paid: !paidUnpaid,
        applies: !appliesTo,
        employees: false,
      });
      setError("All fields are required.");
      return;
    }
    if (daysInvalid) {
      setFieldErrors({ ...clearErrors, days: true });
      setError("Days per year must be a whole number between 0 and 366.");
      return;
    }
    if (appliesTo === "Assign as needed" && selectedIds.length === 0) {
      setFieldErrors({ ...clearErrors, employees: true });
      setError("Choose at least one employee.");
      return;
    }
    const input: LeaveTypeInput = {
      name: trimmed,
      daysPerYear: days,
      paidUnpaid,
      appliesTo,
      employeeIds: appliesTo === "Assign as needed" ? selectedIds : [],
    };
    setPending(true);
    setError("");
    setFieldErrors(clearErrors);
    const result = leaveType
      ? await updateLeaveTypeAction(leaveType.id, input)
      : await createLeaveTypeAction(input);
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
      title={leaveType ? "Update leave type" : "Add leave type"}
      submitLabel={pending ? "Saving…" : leaveType ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Leave type name *">
          <input
            value={name}
            maxLength={200}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              setFieldErrors((current) => ({ ...current, name: current.name && !next.trim() }));
            }}
            className={controlClass(fieldErrors.name)}
          />
        </FormField>
        <FormField label="Days per year *" hint="Working days">
          <input
            type="number"
            min={0}
            max={366}
            value={daysPerYear}
            onChange={(event) => {
              const next = event.target.value;
              const parsed = next === "" ? null : Number(next);
              setDaysPerYear(next);
              setFieldErrors((current) => ({
                ...current,
                days: current.days && (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 366),
              }));
            }}
            className={controlClass(fieldErrors.days)}
          />
        </FormField>
        <FormField label="Paid / unpaid *">
          <select
            value={paidUnpaid}
            onChange={(event) => {
              const next = event.target.value as LeavePaidUnpaid | "";
              setPaidUnpaid(next);
              setFieldErrors((current) => ({ ...current, paid: current.paid && !next }));
            }}
            className={controlClass(fieldErrors.paid)}
          >
            <option value="">Select</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </FormField>
        <FormField
          label="Applies to *"
          hint={
            appliesTo === "Assign as needed"
              ? "Only the selected employees get this leave type"
              : appliesTo === "Everyone"
                ? "Everyone gets the days per year unless a balance overrides it"
                : undefined
          }
        >
          <select
            value={appliesTo}
            onChange={(event) => {
              const next = event.target.value as LeaveAppliesTo | "";
              setAppliesTo(next);
              setFieldErrors((current) => ({ ...current, applies: current.applies && !next }));
            }}
            className={controlClass(fieldErrors.applies)}
          >
            <option value="">Select</option>
            <option value="Everyone">Everyone</option>
            <option value="Assign as needed">Assign as needed</option>
          </select>
        </FormField>
      </div>
      {appliesTo === "Assign as needed" ? (
        <div className="flex flex-col gap-2 border-t border-zinc-200 p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <FormField label="Search" className="max-w-xs">
                <input
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search employees…"
                  className={formControlClass}
                />
              </FormField>
              <FormField label="Department" className="max-w-xs">
                <select
                  value={departmentFilter === "all" ? "all" : departmentFilter === "none" ? "none" : String(departmentFilter)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "all" || value === "none") {
                      setDepartmentFilter(value);
                      return;
                    }
                    setDepartmentFilter(Number(value));
                  }}
                  className={formControlClass}
                >
                  <option value="all">All departments</option>
                  <option value="none">No department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <p className="pb-1 text-xs text-zinc-500">{selectedIds.length} selected</p>
          </div>
          <div
            className={`max-h-72 overflow-auto rounded-md border ${
              fieldErrors.employees ? "border-red-500 bg-red-50" : "border-zinc-200"
            }`}
          >
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      ref={headerRef}
                      type="checkbox"
                      aria-label="Select shown employees"
                      checked={allVisible}
                      disabled={visibleIds.length === 0}
                      onChange={() => {
                        const next = allVisible
                          ? selectedIds.filter((id) => !visibleIds.includes(id))
                          : [...new Set([...selectedIds, ...visibleIds])];
                        setSelectedIds(next);
                        setFieldErrors((current) => ({ ...current, employees: current.employees && next.length === 0 }));
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                </tr>
              </thead>
              <tbody>
                {employeesLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-zinc-500">
                      Loading employees…
                    </td>
                  </tr>
                ) : employeeRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-zinc-500">
                      {appliedEmployeeSearch
                        ? "No employees match this search."
                        : "No employees for this department."}
                    </td>
                  </tr>
                ) : (
                  employeeRows.map((employee) => {
                    const checked = selectedIds.includes(employee.id);
                    return (
                      <tr key={employee.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`${employee.name} (${employee.employeeCode})`}
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selectedIds.filter((id) => id !== employee.id)
                                : [...selectedIds, employee.id];
                              setSelectedIds(next);
                              setFieldErrors((current) => ({
                                ...current,
                                employees: current.employees && next.length === 0,
                              }));
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {employee.name} ({employee.employeeCode})
                        </td>
                        <td className="px-3 py-2">{employee.departmentName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </FormDialogFrame>
  );
}
