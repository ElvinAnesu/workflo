"use client";

import Link from "next/link";
import {
  employeeName,
  useEmployeesState,
} from "@/components/employees/employees-store";
import { formControlClass } from "@/components/form/form-control";

type Option = { id: string; label: string };

type RecordSelectProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyHint?: { text: string; href: string };
  className?: string;
  ariaLabel?: string;
};

export function RecordSelect({
  options,
  value,
  onChange,
  required,
  disabled,
  placeholder = "Select",
  emptyHint,
  className,
  ariaLabel,
}: RecordSelectProps) {
  return (
    <>
      <select
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className ?? formControlClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {options.length === 0 && emptyHint ? (
        <Link href={emptyHint.href} className="text-[11px] text-[#1E40AF]">
          {emptyHint.text}
        </Link>
      ) : null}
    </>
  );
}

// Active employees, plus the currently selected one if they are no longer
// active, so editing an old record never silently drops the employee.
export function useEmployeeOptions(selectedIds: string[] = []): Option[] {
  const { employees } = useEmployeesState();
  return employees
    .filter((employee) => employee.status === "Active" || selectedIds.includes(employee.id))
    .map((employee) => ({
      id: employee.id,
      label: `${employeeName(employee)} (${employee.id})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function EmployeeSelect(
  props: Omit<RecordSelectProps, "options" | "emptyHint">,
) {
  const options = useEmployeeOptions(props.value ? [props.value] : []);
  return (
    <RecordSelect
      {...props}
      options={options}
      emptyHint={{ text: "No active employees. Add employees first", href: "/employees" }}
    />
  );
}

// Display name for an employee id, falling back to the id itself.
export function useEmployeeNames() {
  const { employees } = useEmployeesState();
  const names = new Map(employees.map((employee) => [employee.id, employeeName(employee)]));
  return (id: string) => names.get(id) ?? id;
}
