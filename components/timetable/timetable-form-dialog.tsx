"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTimetableAction,
  listTimetableEmployeesAction,
  updateTimetableAction,
} from "@/app/(app)/timetable/actions";
import { formControlClass } from "@/components/form/form-control";
import {
  CheckboxField,
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { RecordSelect } from "@/components/hr/record-select";
import {
  WEEKDAYS,
  type TimetableDepartmentOption,
  type TimetableEmployeeChoice,
  type TimetableEmployeeFilter,
  type TimetableInput,
  type TimetableListRow,
  type TimetablePattern,
  type TimetableShiftOption,
} from "@/components/timetable/timetable.types";

type TimetableFormDialogProps = {
  entry?: TimetableListRow | null;
  shifts: TimetableShiftOption[];
  departments: TimetableDepartmentOption[];
  onClose: () => void;
};

type DepartmentFilter = "all" | "none" | number;

const invalidControlClass =
  "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type FieldErrors = {
  name: boolean;
  shift: boolean;
  pattern: boolean;
  weekdays: boolean;
  date: boolean;
  employees: boolean;
};

function controlClass(invalid: boolean) {
  return invalid ? invalidControlClass : formControlClass;
}

function toId(value: string) {
  if (!value) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function employeeQuery(
  departmentFilter: DepartmentFilter,
  includeIds: number[],
  search: string,
): TimetableEmployeeFilter {
  const shared = { includeIds, search };
  if (departmentFilter === "none") {
    return { filter: "none", departmentId: null, ...shared };
  }
  if (departmentFilter === "all") {
    return { filter: "all", departmentId: null, ...shared };
  }
  return { filter: "department", departmentId: departmentFilter, ...shared };
}

export function TimetableFormDialog({
  entry,
  shifts,
  departments,
  onClose,
}: TimetableFormDialogProps) {
  const isUpdate = Boolean(entry);
  const router = useRouter();
  const [name, setName] = useState(entry?.name ?? "");
  const [shiftId, setShiftId] = useState(entry ? String(entry.shiftId) : "");
  const [pattern, setPattern] = useState<TimetablePattern | "">(entry?.pattern ?? "");
  const [weekdays, setWeekdays] = useState<string[]>(entry?.weekdays ?? []);
  const [date, setDate] = useState(entry?.workDate ?? "");
  const [selectedIds, setSelectedIds] = useState<number[]>(
    entry?.employees.map((employee) => employee.id) ?? [],
  );
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [appliedEmployeeSearch, setAppliedEmployeeSearch] = useState("");
  const [employeeRows, setEmployeeRows] = useState<TimetableEmployeeChoice[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    name: false,
    shift: false,
    pattern: false,
    weekdays: false,
    date: false,
    employees: false,
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const headerRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const includeIds = entry?.employees.map((employee) => employee.id) ?? [];
  const includeKey = includeIds.join(",");

  const shiftOptions = shifts.map((shift) => ({ id: String(shift.id), label: shift.label }));
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
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const ids = includeKey ? includeKey.split(",").map(Number) : [];
    setEmployeesLoading(true);
    void listTimetableEmployeesAction(employeeQuery(departmentFilter, ids, appliedEmployeeSearch))
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
  }, [appliedEmployeeSearch, departmentFilter, includeKey]);

  function applySelection(next: number[]) {
    setSelectedIds(next);
    setFieldErrors((current) => ({
      ...current,
      employees: current.employees && next.length === 0,
    }));
  }

  function toggleEmployee(id: number) {
    applySelection(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
    );
  }

  function toggleVisible() {
    applySelection(
      allVisible
        ? selectedIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...selectedIds, ...visibleIds])],
    );
  }

  async function handleSubmit() {
    const timetableName = name.trim();
    if (!timetableName || !shiftId || !pattern) {
      setFieldErrors((current) => ({
        ...current,
        name: !timetableName,
        shift: !shiftId,
        pattern: !pattern,
      }));
      setError(timetableName ? "Choose a shift and a pattern." : "Name is required.");
      return;
    }
    if (pattern === "weekly" && weekdays.length === 0) {
      setFieldErrors((current) => ({ ...current, name: false, shift: false, pattern: false, weekdays: true }));
      setError("Choose at least one day of the week.");
      return;
    }
    if (pattern === "date" && !date) {
      setFieldErrors((current) => ({ ...current, name: false, shift: false, pattern: false, date: true }));
      setError("Choose a date.");
      return;
    }
    if (selectedIds.length === 0) {
      setFieldErrors((current) => ({
        ...current,
        name: false,
        shift: false,
        pattern: false,
        weekdays: false,
        date: false,
        employees: true,
      }));
      setError("Add at least one employee.");
      return;
    }

    const input: TimetableInput = {
      name: timetableName,
      shiftId: toId(shiftId),
      pattern,
      weekdays: pattern === "weekly" ? WEEKDAYS.filter((day) => weekdays.includes(day)) : [],
      workDate: pattern === "date" ? date : "",
      employeeIds: selectedIds,
    };

    setPending(true);
    setError("");
    setFieldErrors({
      name: false,
      shift: false,
      pattern: false,
      weekdays: false,
      date: false,
      employees: false,
    });
    const result = entry
      ? await updateTimetableAction(entry.id, input)
      : await createTimetableAction(input);
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
      title={isUpdate ? "Update timetable entry" : "Add timetable entry"}
      submitLabel={pending ? "Saving…" : isUpdate ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <FormSectionStrip title="Timetable details" />
      <div className={sectionGridClass}>
        <FormField label="Name *" className="sm:col-span-2">
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
        <FormField label="Shift *" className="sm:col-span-2">
          <RecordSelect
            options={shiftOptions}
            value={shiftId}
            onChange={(value) => {
              setShiftId(value);
              setFieldErrors((current) => ({ ...current, shift: current.shift && !value }));
            }}
            className={controlClass(fieldErrors.shift)}
            emptyHint={{ text: "No shifts yet. Add them first", href: "/shifts" }}
          />
        </FormField>
        <FormField label="Pattern *">
          <select
            value={pattern}
            onChange={(event) => {
              const next = event.target.value as TimetablePattern | "";
              setPattern(next);
              setFieldErrors((current) => ({
                ...current,
                pattern: current.pattern && !next,
                weekdays: next === "weekly" ? current.weekdays && weekdays.length === 0 : false,
                date: next === "date" ? current.date && !date : false,
              }));
            }}
            className={controlClass(fieldErrors.pattern)}
          >
            <option value="">Select</option>
            <option value="weekly">Weekly</option>
            <option value="date">Date override</option>
          </select>
        </FormField>
        {pattern === "date" ? (
          <FormField label="Date *">
            <input
              type="date"
              value={date}
              onChange={(event) => {
                const next = event.target.value;
                setDate(next);
                setFieldErrors((current) => ({ ...current, date: current.date && !next }));
              }}
              className={controlClass(fieldErrors.date)}
            />
          </FormField>
        ) : null}
        {pattern === "weekly" ? (
          <fieldset
            className={`col-span-full flex flex-col gap-1 text-xs text-zinc-600 ${
              fieldErrors.weekdays ? "rounded-md border border-red-500 bg-red-50 p-2" : ""
            }`}
          >
            <legend>Days *</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {WEEKDAYS.map((weekday) => (
                <CheckboxField
                  key={weekday}
                  label={weekday}
                  checked={weekdays.includes(weekday)}
                  onChange={(checked) => {
                    const next = checked
                      ? [...weekdays, weekday]
                      : weekdays.filter((day) => day !== weekday);
                    setWeekdays(next);
                    setFieldErrors((current) => ({
                      ...current,
                      weekdays: current.weekdays && next.length === 0,
                    }));
                  }}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
      <FormSectionStrip title="Employees" />
      <div className="flex flex-col gap-2 p-4">
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
                    onChange={toggleVisible}
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
                    <tr
                      key={employee.id}
                      className="border-t border-zinc-100"
                      onClick={() => toggleEmployee(employee.id)}
                    >
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`${employee.name} (${employee.employeeCode})`}
                          checked={checked}
                          onChange={() => toggleEmployee(employee.id)}
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
    </FormDialogFrame>
  );
}
