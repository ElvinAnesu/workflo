"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAssignmentAction, saveAssignmentAction } from "@/app/(app)/payroll/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  CheckboxField,
  FormDialogFrame,
  FormField,
  linkButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { calculateEmployeePay, validateTaxBands } from "@/components/payroll/payroll-engine";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import type {
  AssignedComponent,
  Bank,
  PayAssignmentRow,
  PayCalculation,
  PayComponent,
  StatutoryContribution,
  TaxBand,
} from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type AssignmentDetail = {
  employeeId: number;
  employeeCode: string;
  name: string;
  basicSalary: number;
  bankId: string;
  accountNumber: string;
  components: { componentId: string; value: number }[];
  contributionIds: string[];
  catalog: {
    components: PayComponent[];
    contributions: StatutoryContribution[];
    banks: Bank[];
    taxBands: TaxBand[];
    allContributions: StatutoryContribution[];
  };
};

function PreviewRow({
  label,
  value,
  strong,
  negative,
}: {
  label: string;
  value: number;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 py-1 text-xs ${strong ? "font-semibold text-zinc-900" : "text-zinc-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {negative && value > 0 ? "−" : ""}
        {formatMoney(value)}
      </span>
    </div>
  );
}

function PayPreview({ pay, taxReady }: { pay: PayCalculation; taxReady: boolean }) {
  return (
    <div className="flex flex-col rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <p className="mb-1 text-xs font-semibold text-zinc-800">Monthly preview</p>
      <PreviewRow label="Basic salary" value={pay.basicSalary} />
      {pay.earnings.map((item) => (
        <PreviewRow key={item.componentId} label={item.name} value={item.amount} />
      ))}
      <div className="my-1 border-t border-zinc-200" />
      <PreviewRow label="Gross pay" value={pay.grossPay} strong />
      {pay.contributions
        .filter((line) => line.employee > 0)
        .map((line) => (
          <PreviewRow key={line.contributionId} label={`${line.code} (employee)`} value={line.employee} negative />
        ))}
      <PreviewRow label="Taxable income" value={pay.taxableIncome} />
      <PreviewRow label="PAYE" value={pay.paye} negative />
      {pay.deductions.map((item) => (
        <PreviewRow key={item.componentId} label={item.name} value={item.amount} negative />
      ))}
      <div className="my-1 border-t border-zinc-200" />
      <PreviewRow label="Net pay" value={pay.netPay} strong />
      {pay.employerContributions > 0 ? <PreviewRow label="Employer contributions" value={pay.employerContributions} /> : null}
      {!taxReady ? <p className="mt-2 text-[11px] text-amber-700">PAYE shows 0 until tax bands are configured.</p> : null}
      {pay.netPay < 0 ? <p className="mt-2 text-[11px] text-red-600">Deductions are higher than gross pay.</p> : null}
    </div>
  );
}

function AssignmentDialog({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [basic, setBasic] = useState("");
  const [assigned, setAssigned] = useState<{ componentId: string; value: string }[]>([]);
  const [bankId, setBankId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [contributionIds, setContributionIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void getAssignmentAction(employeeId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error ?? "This employee was not found.");
        return;
      }
      setDetail(result);
      setBasic(result.basicSalary ? String(result.basicSalary) : "");
      setAssigned(result.components.map((item) => ({ componentId: item.componentId, value: String(item.value) })));
      setBankId(result.bankId);
      setAccountNumber(result.accountNumber);
      setContributionIds(result.contributionIds);
    });
  }, [employeeId]);

  const catalog = detail?.catalog;
  const components = catalog?.components ?? [];
  const available = components.filter(
    (component) => component.active && !assigned.some((item) => item.componentId === component.id),
  );
  const optional = (catalog?.contributions ?? []).filter((item) => item.active);
  const basicSalary = parseAmount(basic || "0");
  const profileComponents: AssignedComponent[] = assigned.map((item) => ({
    componentId: item.componentId,
    value: parseAmount(item.value || "0"),
  }));
  const validNumbers = Number.isFinite(basicSalary) && profileComponents.every((item) => Number.isFinite(item.value) && item.value >= 0);
  const pay =
    catalog && validNumbers
      ? calculateEmployeePay(
          { basicSalary, components: profileComponents, contributionIds },
          {
            components: catalog.components,
            contributions: catalog.allContributions,
            taxBands: catalog.taxBands,
          },
        )
      : null;

  function addComponent(componentId: string) {
    const component = components.find((item) => item.id === componentId);
    if (component) {
      setAssigned([...assigned, { componentId, value: String(component.defaultValue) }]);
    }
  }

  async function handleSubmit() {
    setSubmitted(true);
    if (!(basicSalary > 0)) {
      setError("Enter a basic salary greater than 0.");
      return;
    }
    if (!validNumbers) {
      setError("Every amount must be a number of 0 or more.");
      return;
    }
    const result = await saveAssignmentAction({
      employeeId,
      basicSalary,
      bankId,
      accountNumber: accountNumber.trim(),
      components: profileComponents,
      contributionIds,
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  if (!detail) {
    return (
      <FormDialogFrame title="Pay setup" submitLabel="Save" onSubmit={() => undefined} onClose={onClose} error={loadError}>
        <p className="p-4 text-xs text-zinc-500">{loadError || "Loading pay setup…"}</p>
      </FormDialogFrame>
    );
  }

  return (
    <FormDialogFrame
      title={`Pay setup · ${detail.name} (${detail.employeeCode})`}
      submitLabel="Save"
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <FormSectionStrip title="Salary" />
          <div className={sectionGridClass}>
            <FormField label="Basic salary (monthly)">
              <input
                inputMode="decimal"
                value={basic}
                onChange={(event) => setBasic(event.target.value)}
                className={submitted && !(basicSalary > 0) ? invalidClass : formControlClass}
              />
            </FormField>
          </div>

          <FormSectionStrip title="Earnings and deductions" />
          <div className="flex flex-col gap-2 p-4">
            {assigned.length > 0 ? (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="pb-1 font-semibold">Component</th>
                    <th className="pb-1 font-semibold">Type</th>
                    <th className="pb-1 font-semibold">Value</th>
                    <th className="pb-1 text-right font-semibold">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((item, index) => {
                    const component = components.find((entry) => entry.id === item.componentId);
                    const calculated = [...(pay?.earnings ?? []), ...(pay?.deductions ?? [])].find(
                      (line) => line.componentId === item.componentId,
                    );
                    return (
                      <tr key={item.componentId} className="border-t border-zinc-100">
                        <td className="py-1.5 pr-2 text-zinc-800">
                          {component?.name ?? "Deleted component"}
                          {component && !component.active ? <span className="ml-1 text-amber-700">(inactive)</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-zinc-500">{component?.type}</td>
                        <td className="py-1.5 pr-2">
                          <span className="inline-flex items-center gap-1">
                            <input
                              inputMode="decimal"
                              aria-label={`${component?.name ?? "Component"} value`}
                              value={item.value}
                              onChange={(event) =>
                                setAssigned(assigned.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))
                              }
                              className={`${formControlClass} w-28`}
                            />
                            {component?.calculation === "% of basic salary" ? <span className="text-zinc-500">%</span> : null}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-zinc-800 tabular-nums">
                          {calculated ? formatMoney(calculated.amount) : "—"}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            type="button"
                            aria-label="Remove component"
                            onClick={() => setAssigned(assigned.filter((_, i) => i !== index))}
                            className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-zinc-500">No components assigned.</p>
            )}
            {components.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No pay components exist yet.{" "}
                <Link href="/settings/pay-components" className={linkButtonClass}>
                  Create them in Settings
                </Link>
                .
              </p>
            ) : available.length > 0 ? (
              <select
                aria-label="Add component"
                value=""
                onChange={(event) => addComponent(event.target.value)}
                className={`${formControlClass} w-64`}
              >
                <option value="">+ Add component…</option>
                {available.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name} ({component.type.toLowerCase()})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {optional.length > 0 ? (
            <>
              <FormSectionStrip title="Contributions for selected employees" />
              <div className="flex flex-col gap-2 p-4">
                {optional.map((contribution) => (
                  <CheckboxField
                    key={contribution.id}
                    label={`${contribution.name} (${contribution.code})`}
                    checked={contributionIds.includes(contribution.id)}
                    onChange={(checked) =>
                      setContributionIds(
                        checked ? [...contributionIds, contribution.id] : contributionIds.filter((id) => id !== contribution.id),
                      )
                    }
                  />
                ))}
              </div>
            </>
          ) : null}

          <FormSectionStrip title="Payment" />
          <div className={sectionGridClass}>
            <FormField label="Bank">
              <select value={bankId} onChange={(event) => setBankId(event.target.value)} className={formControlClass}>
                <option value="">Select</option>
                {(catalog?.banks ?? []).map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Account number">
              <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} className={formControlClass} />
            </FormField>
          </div>
        </div>
        <div className="border-zinc-200 p-4 lg:border-l">
          {pay ? (
            <PayPreview pay={pay} taxReady={validateTaxBands(catalog?.taxBands ?? []).length === 0} />
          ) : (
            <p className="text-xs text-red-600">Check the amounts entered.</p>
          )}
        </div>
      </div>
    </FormDialogFrame>
  );
}

export function ComponentAssignmentPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  status,
}: {
  rows: PayAssignmentRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  status: string;
}) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: { search?: string; page?: number; pageSize?: number; sort?: DataTableSort; status?: string }) {
    const nextStatus = next.status ?? status;
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
        extra: { status: nextStatus === "Active" ? "" : nextStatus },
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<PayAssignmentRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "employeeCode", label: "Employee code" },
      { key: "name", label: "Employee name" },
      { key: "department", label: "Department" },
      {
        key: "basicSalary",
        label: "Basic salary",
        render: (row) => (row.basicSalary > 0 ? formatMoney(row.basicSalary) : <span className="text-amber-700">Not set</span>),
      },
      { key: "componentCount", label: "Components" },
      {
        key: "grossPay",
        label: "Gross pay",
        render: (row) => (row.grossPay > 0 ? formatMoney(row.grossPay) : "—"),
      },
      {
        key: "bank",
        label: "Bank",
        render: (row) => row.bank || <span className="text-amber-700">Missing</span>,
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
                overlay.show(<AssignmentDialog key={`assign-${row.id}`} employeeId={row.id} onClose={overlay.close} />)
              }
              className={linkButtonClass}
            >
              Set up pay
            </button>
          </RowActions>
        ),
      },
    ],
    [overlay, page, pageSize],
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
      searchPlaceholder="Search employees…"
      emptyMessage={search || status === "All" ? "No employees match" : "No employees yet. Add employees first."}
      actions={
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => replaceQuery({ status: event.target.value, page: 1 })}
          className={formControlClass}
        >
          <option value="Active">Active employees</option>
          <option value="All">All employees</option>
        </select>
      }
    />
  );
}
