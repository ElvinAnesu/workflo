"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteContributionAction,
  saveContributionAction,
} from "@/app/(app)/settings/payroll-actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  CheckboxField,
  dangerLinkButtonClass,
  FormDialogFrame,
  FormField,
  linkButtonClass,
  primaryButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatRate, parseAmount } from "@/components/payroll/payroll-format";
import {
  CONTRIBUTION_BASES,
  CONTRIBUTION_SCOPES,
  type ContributionBase,
  type ContributionListRow,
  type ContributionScope,
} from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function ContributionDialog({
  contribution,
  onClose,
}: {
  contribution: ContributionListRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    code: contribution?.code ?? "",
    name: contribution?.name ?? "",
    base: contribution?.base ?? ("Gross pay" as ContributionBase),
    employeeRate: contribution ? String(contribution.employeeRate) : "0",
    employerRate: contribution ? String(contribution.employerRate) : "0",
    deductBeforeTax: contribution?.deductBeforeTax ?? false,
    scope: contribution?.scope ?? ("All employees" as ContributionScope),
    active: contribution?.active ?? true,
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitted(true);
    const code = form.code.trim().toUpperCase();
    const employeeRate = parseAmount(form.employeeRate || "0");
    const employerRate = parseAmount(form.employerRate || "0");

    if (!code || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }
    for (const [label, rate] of [
      ["Employee rate", employeeRate],
      ["Employer rate", employerRate],
    ] as const) {
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        setError(`${label} must be between 0 and 100.`);
        return;
      }
    }
    if (employeeRate === 0 && employerRate === 0) {
      setError("Set an employee rate, an employer rate, or both.");
      return;
    }

    const result = await saveContributionAction({
      id: contribution ? Number(contribution.id) : undefined,
      code,
      name: form.name.trim(),
      base: form.base,
      employeeRate,
      employerRate,
      deductBeforeTax: employeeRate > 0 ? form.deductBeforeTax : false,
      scope: form.scope,
      active: form.active,
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <FormDialogFrame
      title={contribution ? "Update statutory rate" : "Add statutory rate"}
      submitLabel={contribution ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Code" hint="Shown as a payslip column">
          <input
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            className={`${submitted && !form.code.trim() ? invalidClass : formControlClass} uppercase`}
          />
        </FormField>
        <FormField label="Name" className="sm:col-span-2">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={submitted && !form.name.trim() ? invalidClass : formControlClass}
          />
        </FormField>
        <FormField label="Calculated on">
          <select
            value={form.base}
            onChange={(event) => setForm({ ...form, base: event.target.value as ContributionBase })}
            className={formControlClass}
          >
            {CONTRIBUTION_BASES.map((base) => (
              <option key={base} value={base}>
                {base}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Employee rate (%)" hint="Deducted from the employee's pay">
          <input
            inputMode="decimal"
            value={form.employeeRate}
            onChange={(event) => setForm({ ...form, employeeRate: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Employer rate (%)" hint="Paid by the company on top of pay">
          <input
            inputMode="decimal"
            value={form.employerRate}
            onChange={(event) => setForm({ ...form, employerRate: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Applies to">
          <select
            value={form.scope}
            onChange={(event) => setForm({ ...form, scope: event.target.value as ContributionScope })}
            className={formControlClass}
          >
            {CONTRIBUTION_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col justify-end gap-2">
          <CheckboxField
            label="Deduct before tax"
            hint="Employee share reduces taxable income"
            checked={form.deductBeforeTax}
            onChange={(deductBeforeTax) => setForm({ ...form, deductBeforeTax })}
          />
          <CheckboxField label="Active" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
        </div>
        {form.scope === "Selected employees" ? (
          <p className="text-xs text-zinc-500 sm:col-span-4">
            Choose which employees this applies to in Payroll → Component assignment.
          </p>
        ) : null}
      </div>
    </FormDialogFrame>
  );
}

export function StatutoryRatesPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: {
  rows: ContributionListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: { search?: string; page?: number; pageSize?: number; sort?: DataTableSort }) {
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<ContributionListRow>[]>(
    () => [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "base", label: "Calculated on" },
      { key: "employeeRate", label: "Employee", render: (row) => formatRate(row.employeeRate) },
      { key: "employerRate", label: "Employer", render: (row) => formatRate(row.employerRate) },
      {
        key: "deductBeforeTax",
        label: "Before tax",
        render: (row) => (row.deductBeforeTax ? "Yes" : "No"),
      },
      { key: "scope", label: "Applies to" },
      {
        key: "active",
        label: "Status",
        render: (row) => (row.active ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <ContributionDialog key={`edit-${row.id}`} contribution={row} onClose={overlay.close} />,
                )
              }
              className={linkButtonClass}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${row.name}? Payrolls already calculated keep their figures.`)) {
                  void deleteContributionAction(Number(row.id)).then((result) => {
                    if ("error" in result && result.error) {
                      window.alert(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }
              }}
              className={dangerLinkButtonClass}
            >
              Delete
            </button>
          </RowActions>
        ),
      },
    ],
    [overlay, router],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      search={search}
      sort={sort}
      onSearch={(value) => replaceQuery({ search: value, page: 1 })}
      onSort={(key) => replaceQuery({ sort: nextSort(sort, key), page: 1 })}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search statutory rates…"
      emptyMessage="No statutory contributions configured. Add each one your company must pay, such as pension funds, workers' compensation, skills levy or health insurance."
      actions={
        <button
          type="button"
          onClick={() =>
            overlay.show(<ContributionDialog key={`new-${Date.now()}`} contribution={null} onClose={overlay.close} />)
          }
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Add
        </button>
      }
    />
  );
}
