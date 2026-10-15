"use client";

import { AlertTriangle, ArrowLeft, Download, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  linkButtonClass,
  secondaryButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass, formControlSearchClass } from "@/components/form/form-control";
import {
  approveOvertimeAction,
  deleteOvertimeEntryAction,
  deleteOvertimeRunAction,
  lockOvertimeAction,
  recalculateOvertimeAction,
  reopenOvertimeAction,
  saveOvertimeEntryAction,
  setOvertimePayPeriodAction,
} from "@/app/(app)/payroll/actions";
import { downloadCsv } from "@/components/payroll/csv-export";
import { overtimeRunTotals } from "@/components/payroll/overtime";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { OvertimeEntry, OvertimeLine, OvertimeRun, OvertimeType, PayrollRunStatus } from "@/components/payroll/payroll.types";
import {
  cardClass,
  RunMessageBar,
  runMeta,
  RunWorkflowBar,
  Stepper,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
  Tile,
  type RunMessage,
} from "@/components/payroll/run-parts";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";
import { ImportDialog } from "@/components/table/import-dialog";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type SheetEmployee = { id: number; code: string; name: string };
type SheetEntry = OvertimeEntry & { employeeCode?: string; employeeName?: string };
type SheetLine = OvertimeLine & { employeeCode?: string };

export type OvertimeDetail = Omit<OvertimeRun, "id" | "entries" | "lines" | "status"> & {
  id: number;
  status: PayrollRunStatus;
  entries: SheetEntry[];
  lines: SheetLine[];
  types: OvertimeType[];
  employees: SheetEmployee[];
  monthly: { id: number; status: PayrollRunStatus } | null;
  standardMonthlyHours: number;
};

function entryProblem(period: string, entry: { employeeId: string; typeId: string; date: string; hours: number }, types: OvertimeType[]) {
  if (!entry.employeeId) return "Choose an employee.";
  if (!types.some((type) => type.id === entry.typeId)) return "Choose an overtime rate.";
  if (!entry.date.startsWith(`${period}-`)) return `The date must be in ${formatPeriod(period)}.`;
  if (!(entry.hours > 0) || entry.hours > 24) return "Hours must be more than 0 and no more than 24.";
  return "";
}

function lastDayOfMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

function EntryDialog({
  run,
  entry,
  employees,
  types,
  onClose,
}: {
  run: OvertimeDetail;
  entry: SheetEntry | null;
  employees: SheetEmployee[];
  types: OvertimeType[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    employeeId: entry?.employeeId ?? "",
    typeId: entry?.typeId ?? types.find((type) => type.active)?.id ?? "",
    date: entry?.date ?? `${run.period}-01`,
    hours: entry ? String(entry.hours) : "",
    note: entry?.note ?? "",
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitted(true);
    const next = { ...form, hours: parseAmount(form.hours || "0"), note: form.note.trim() };
    const problem = entryProblem(run.period, next, types);
    if (problem) {
      setError(problem);
      return;
    }
    if (entry) {
      const removed = await deleteOvertimeEntryAction(run.id, Number(entry.id));
      if ("error" in removed && removed.error) {
        setError(removed.error);
        return;
      }
    }
    const saved = await saveOvertimeEntryAction(run.id, {
      employeeId: Number(next.employeeId),
      typeId: Number(next.typeId),
      date: next.date,
      hours: next.hours,
      note: next.note,
    });
    if ("error" in saved && saved.error) {
      setError(saved.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <FormDialogFrame
      title={entry ? "Update overtime" : "Add overtime"}
      submitLabel={entry ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee" className="sm:col-span-2">
          <select
            value={form.employeeId}
            onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
            className={submitted && !form.employeeId ? invalidClass : formControlClass}
          >
            <option value="">Select</option>
            {employees.map((employee) => (
              <option key={employee.id} value={String(employee.id)}>
                {employee.code} · {employee.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Overtime rate" className="sm:col-span-2">
          <select
            value={form.typeId}
            onChange={(event) => setForm({ ...form, typeId: event.target.value })}
            className={submitted && !form.typeId ? invalidClass : formControlClass}
          >
            <option value="">Select</option>
            {types
              .filter((type) => type.active || type.id === entry?.typeId)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.multiplier}×)
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Date">
          <input
            type="date"
            value={form.date}
            min={`${run.period}-01`}
            max={lastDayOfMonth(run.period)}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Hours">
          <input
            inputMode="decimal"
            value={form.hours}
            onChange={(event) => setForm({ ...form, hours: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Note" className="sm:col-span-2">
          <input
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            className={formControlClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}

const IMPORT_COLUMNS = [
  { key: "employeeId", header: "Employee code", required: true },
  { key: "rate", header: "Rate code", required: true },
  { key: "date", header: "Date", required: true },
  { key: "hours", header: "Hours", required: true },
  { key: "note", header: "Note" },
];

function exportSheet(run: OvertimeDetail, typeName: (id: string) => string) {
  downloadCsv(
    `overtime-${run.period}.csv`,
    ["Employee code", "Employee name", "Date", "Overtime rate", "Hours", "Note"],
    [...run.entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => [
        entry.employeeCode || entry.employeeId,
        entry.employeeName || entry.employeeId,
        entry.date,
        typeName(entry.typeId),
        entry.hours,
        entry.note,
      ]),
  );
}

function exportSummary(run: OvertimeDetail) {
  downloadCsv(
    `overtime-summary-${run.period}.csv`,
    ["Employee code", "Employee name", "Department", "Basic salary", "Hourly rate", "Overtime rate", "Multiplier", "Hours", "Amount"],
    run.lines.flatMap((line) =>
      line.items.map((item) => [
        line.employeeCode || line.employeeId,
        line.employeeName,
        line.department,
        line.basicSalary,
        line.hourlyRate,
        item.name,
        item.multiplier,
        item.hours,
        item.amount,
      ]),
    ),
  );
}

export function OvertimeRunDetail({ run }: { run: OvertimeDetail | null }) {
  const router = useRouter();
  const overlay = useOverlayDialog();
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<RunMessage>(null);

  if (!run) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/payroll/overtime" className={`${linkButtonClass} inline-flex items-center gap-1`}>
          <ArrowLeft className="size-3.5" />
          Overtime payroll
        </Link>
        <p className="text-sm text-zinc-500">This overtime sheet was not found.</p>
      </div>
    );
  }

  const current = run;
  const isDraft = current.status === "Draft";
  const totals = overtimeRunTotals(current);
  const types = current.types;
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? id;
  const usedTypes = types.filter((type) => current.lines.some((line) => line.items.some((item) => item.typeId === type.id)));
  const nameOf = (id: string) =>
    current.entries.find((entry) => entry.employeeId === id)?.employeeName ||
    current.employees.find((employee) => String(employee.id) === id)?.name ||
    id;
  const codeOf = (id: string) =>
    current.entries.find((entry) => entry.employeeId === id)?.employeeCode ||
    current.employees.find((employee) => String(employee.id) === id)?.code ||
    id;
  const amountByEntry = (entry: SheetEntry) => {
    const line = current.lines.find((item) => item.employeeId === entry.employeeId);
    const multiplier = types.find((type) => type.id === entry.typeId)?.multiplier ?? 0;
    return line ? Math.round(entry.hours * line.hourlyRate * multiplier * 100) / 100 : null;
  };
  const monthly = current.monthly;
  const term = search.trim().toLowerCase();
  const entries = [...current.entries]
    .sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.employeeId).localeCompare(nameOf(b.employeeId)))
    .filter(
      (entry) =>
        !term ||
        [codeOf(entry.employeeId), nameOf(entry.employeeId), typeName(entry.typeId), entry.note, entry.date]
          .join(" ")
          .toLowerCase()
          .includes(term),
    );

  function showEntry(entry: SheetEntry | null) {
    overlay.show(
      <EntryDialog
        key={entry ? `edit-${entry.id}` : `new-${Date.now()}`}
        run={current}
        entry={entry}
        employees={current.employees}
        types={types}
        onClose={overlay.close}
      />,
    );
  }

  async function handleImport(records: Record<string, string>[], dryRun: boolean) {
    const problems: string[] = [];
    const parsed: { employeeId: number; typeId: number; date: string; hours: number; note: string }[] = [];
    records.forEach((record, index) => {
      const row = `Row ${index + 2}`;
      const employee = current.employees.find((item) => item.code.toLowerCase() === record.employeeId.trim().toLowerCase());
      const type = types.find((item) => item.code.toLowerCase() === record.rate.trim().toLowerCase());
      if (!employee) {
        problems.push(`${row}: employee ${record.employeeId} was not found.`);
        return;
      }
      if (!type) {
        problems.push(`${row}: overtime rate ${record.rate} was not found.`);
        return;
      }
      const entry = {
        employeeId: String(employee.id),
        typeId: type.id,
        date: record.date.trim(),
        hours: parseAmount(record.hours || "0"),
        note: (record.note ?? "").trim(),
      };
      const problem = entryProblem(current.period, entry, types);
      if (problem) {
        problems.push(`${row}: ${problem}`);
        return;
      }
      parsed.push({
        employeeId: employee.id,
        typeId: Number(type.id),
        date: entry.date,
        hours: entry.hours,
        note: entry.note,
      });
    });
    if (problems.length === 0 && !dryRun) {
      for (const entry of parsed) {
        const result = await saveOvertimeEntryAction(current.id, entry);
        if ("error" in result && result.error) {
          problems.push(result.error);
          break;
        }
      }
      if (problems.length === 0) {
        router.refresh();
      }
    }
    return problems;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/payroll/overtime" className={`${linkButtonClass} inline-flex items-center gap-1`}>
            <ArrowLeft className="size-3.5" />
            Overtime payroll
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-900">Overtime · {formatPeriod(current.period)}</h1>
            <RunStatusBadge status={current.status} />
          </div>
          <p className="text-xs text-zinc-500">{runMeta(current)}</p>
        </div>
        <Stepper status={current.status} />
      </div>

      <RunWorkflowBar
        status={current.status}
        onRecalculate={() => {
          void recalculateOvertimeAction(current.id).then((result) => {
            setMessage(
              "error" in result && result.error
                ? { tone: "error", text: result.error }
                : { tone: "ok", text: "Recalculated with the latest salaries and rates." },
            );
            if (!("error" in result && result.error)) {
              router.refresh();
            }
          });
        }}
        onApprove={(approver) => {
          void approveOvertimeAction(current.id, approver).then((result) => {
            if ("error" in result && result.error) {
              setMessage({ tone: "error", text: result.error });
              return;
            }
            setMessage({ tone: "ok", text: "Overtime approved." });
            router.refresh();
          });
        }}
        approveBlockedReason={current.lines.length === 0 ? "Add overtime first" : undefined}
        onReopen={() => {
          void reopenOvertimeAction(current.id).then((result) => {
            if ("error" in result && result.error) {
              setMessage({ tone: "error", text: result.error });
              return;
            }
            router.refresh();
          });
        }}
        onLock={() => {
          if (
            window.confirm(
              `Lock the ${formatPeriod(current.period)} overtime? It will be paid in the ${formatPeriod(current.payPeriod)} payroll and can no longer be changed.`,
            )
          ) {
            void lockOvertimeAction(current.id).then((result) => {
              setMessage(
                "error" in result && result.error
                  ? { tone: "error", text: result.error }
                  : { tone: "ok", text: `Locked. It will be paid in the ${formatPeriod(current.payPeriod)} payroll.` },
              );
              if (!("error" in result && result.error)) {
                router.refresh();
              }
            });
          }
        }}
        onDelete={() => {
          if (window.confirm(`Delete the draft ${formatPeriod(current.period)} overtime sheet?`)) {
            void deleteOvertimeRunAction(current.id).then((result) => {
              if ("error" in result && result.error) {
                setMessage({ tone: "error", text: result.error });
                return;
              }
              router.push("/payroll/overtime");
            });
          }
        }}
        onMessage={setMessage}
      >
        <button
          type="button"
          onClick={() => exportSummary(current)}
          disabled={current.lines.length === 0}
          className={secondaryButtonClass}
        >
          <Download className="size-4" />
          Export summary
        </button>
      </RunWorkflowBar>

      <RunMessageBar message={message} />

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 px-3 py-2.5 text-xs text-zinc-600">
        <span>Paid in the payroll of</span>
        {isDraft ? (
          <input
            type="month"
            value={current.payPeriod}
            min={current.period}
            onChange={(event) => {
              void setOvertimePayPeriodAction(current.id, event.target.value).then((result) => {
                setMessage("error" in result && result.error ? { tone: "error", text: result.error } : null);
                if (!("error" in result && result.error)) {
                  router.refresh();
                }
              });
            }}
            className={formControlClass}
          />
        ) : (
          <span className="font-medium text-zinc-900">{formatPeriod(current.payPeriod)}</span>
        )}
        <span className="text-zinc-400">·</span>
        {current.status === "Locked" ? (
          monthly ? (
            <span>
              Included in the{" "}
              <Link href={`/payroll/monthly/${monthly.id}`} className={linkButtonClass}>
                {formatPeriod(current.payPeriod)} payroll
              </Link>{" "}
              ({monthly.status.toLowerCase()}
              {monthly.status === "Draft" ? ", recalculate it if it was run before this was locked" : ""})
            </span>
          ) : (
            <span>Paid when the {formatPeriod(current.payPeriod)} payroll is run.</span>
          )
        ) : (
          <span>Paid only once this sheet is locked.</span>
        )}
        <span className="text-zinc-400">·</span>
        <span>
          Hourly rate = basic salary ÷ {current.standardMonthlyHours || "?"} hours (
          <Link href="/settings/overtime" className={linkButtonClass}>
            settings
          </Link>
          )
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Employees" value={String(totals.employees)} />
        <Tile label="Entries" value={String(current.entries.length)} />
        <Tile label="Hours" value={String(totals.hours)} />
        <Tile label="Overtime pay" value={formatMoney(totals.amount)} />
      </div>

      {current.excluded.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-4" />
            Needs attention ({current.excluded.length})
          </h2>
          <ul className="flex flex-col gap-1 text-xs text-amber-900">
            {current.excluded.map((item) => (
              <li key={item.employeeId}>
                <span className="font-medium">
                  {item.employeeId} · {item.employeeName}
                </span>{" "}
                is not paid overtime: {item.reason}.{" "}
                {isDraft ? (
                  <Link href="/payroll/component-assignment" className="underline">
                    Set up pay
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-zinc-800">Overtime pay by employee</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50">
              <tr>
                <th className={thClass}>Employee code</th>
                <th className={thClass}>Employee name</th>
                <th className={thClass}>Department</th>
                <th className={thNumClass}>Basic salary</th>
                <th className={thNumClass}>Hourly rate</th>
                {usedTypes.map((type) => (
                  <th key={type.id} className={thNumClass}>
                    {type.name} ({type.multiplier}×) h
                  </th>
                ))}
                <th className={thNumClass}>Hours</th>
                <th className={thNumClass}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {current.lines.map((line) => (
                <tr key={line.employeeId} className="border-t border-zinc-100">
                  <td className={tdClass}>{line.employeeCode || line.employeeId}</td>
                  <td className={`${tdClass} text-zinc-900`}>{line.employeeName}</td>
                  <td className={tdClass}>{line.department || "—"}</td>
                  <td className={tdNumClass}>{formatMoney(line.basicSalary)}</td>
                  <td className={tdNumClass}>{formatMoney(line.hourlyRate)}</td>
                  {usedTypes.map((type) => (
                    <td key={type.id} className={tdNumClass}>
                      {line.items.find((item) => item.typeId === type.id)?.hours ?? "—"}
                    </td>
                  ))}
                  <td className={tdNumClass}>{line.hours}</td>
                  <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            {current.lines.length > 0 ? (
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className={`${tdClass} font-semibold text-zinc-900`} colSpan={5}>
                    Total ({totals.employees} employees)
                  </td>
                  {usedTypes.map((type) => (
                    <td key={type.id} className={`${tdNumClass} font-semibold`}>
                      {Math.round(
                        current.lines.reduce(
                          (sum, line) => sum + (line.items.find((item) => item.typeId === type.id)?.hours ?? 0),
                          0,
                        ) * 100,
                      ) / 100}
                    </td>
                  ))}
                  <td className={`${tdNumClass} font-semibold`}>{totals.hours}</td>
                  <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.amount)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {current.lines.length === 0 ? (
          <p className="border-t border-zinc-200 px-3 py-10 text-center text-xs text-zinc-500">
            No overtime recorded yet
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-800">Overtime entries</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search entries…"
                className={formControlSearchClass}
              />
            </label>
            <button
              type="button"
              onClick={() => exportSheet(current, typeName)}
              disabled={current.entries.length === 0}
              className={secondaryButtonClass}
            >
              <Download className="size-4" />
              Export
            </button>
            {isDraft ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    overlay.show(
                      <ImportDialog
                        key={`import-${Date.now()}`}
                        title="Import overtime"
                        templateName={`overtime-${current.period}-template.csv`}
                        columns={IMPORT_COLUMNS}
                        onImport={handleImport}
                        onClose={overlay.close}
                      />,
                    )
                  }
                  className={secondaryButtonClass}
                >
                  <Upload className="size-4" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => showEntry(null)}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
                >
                  <Plus className="size-4" />
                  Add overtime
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50">
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Employee code</th>
                <th className={thClass}>Employee name</th>
                <th className={thClass}>Overtime rate</th>
                <th className={thNumClass}>Hours</th>
                <th className={thNumClass}>Amount</th>
                <th className={thClass}>Note</th>
                {isDraft ? <th className={thClass}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const amount = amountByEntry(entry);
                return (
                  <tr key={entry.id} className="border-t border-zinc-100">
                    <td className={tdClass}>{entry.date}</td>
                    <td className={tdClass}>{codeOf(entry.employeeId)}</td>
                    <td className={`${tdClass} text-zinc-900`}>{nameOf(entry.employeeId)}</td>
                    <td className={tdClass}>{typeName(entry.typeId)}</td>
                    <td className={tdNumClass}>{entry.hours}</td>
                    <td className={tdNumClass}>{amount === null ? "—" : formatMoney(amount)}</td>
                    <td className={tdClass}>{entry.note || "—"}</td>
                    {isDraft ? (
                      <td className={tdClass}>
                        <span className="flex gap-3">
                          <button type="button" onClick={() => showEntry(entry)} className={linkButtonClass}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteOvertimeEntryAction(current.id, Number(entry.id)).then((result) => {
                                if ("error" in result && result.error) {
                                  setMessage({ tone: "error", text: result.error });
                                  return;
                                }
                                router.refresh();
                              });
                            }}
                            className="text-xs font-medium text-red-600"
                          >
                            Delete
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {entries.length === 0 ? (
            <p className="border-t border-zinc-200 px-3 py-10 text-center text-xs text-zinc-500">
              {current.entries.length === 0 ? "No overtime recorded yet" : "No entries match"}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
