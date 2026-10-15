"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deletePlanAction, listPlansAction } from "@/app/(app)/payroll/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { linkButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import type { PlanDisplayStatus } from "@/components/payroll/deduction-plans";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatMoney } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { DeductionPlanKind, PlanListRow } from "@/components/payroll/payroll.types";
import { PLAN_COPY, PlanStatusBadge } from "@/components/payroll/plans/plan-copy";
import { PlanDetailDialog } from "@/components/payroll/plans/plan-detail-dialog";
import { PlanFormDialog } from "@/components/payroll/plans/plan-form-dialog";
import { Tile } from "@/components/payroll/run-parts";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

const STATUS_FILTERS: PlanDisplayStatus[] = ["Pending", "Active", "Paused", "Completed", "Closed", "Rejected"];

export function DeductionPlansPage({
  kind,
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  status,
  awaiting,
  paused,
  running,
  completed,
  outstanding,
  dueNext,
  nextPeriod,
}: {
  kind: DeductionPlanKind;
  rows: PlanListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  status: string;
  awaiting: number;
  paused: number;
  running: number;
  completed: number;
  outstanding: number;
  dueNext: number;
  nextPeriod: string;
}) {
  const copy = PLAN_COPY[kind];
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: {
    search?: string;
    page?: number;
    pageSize?: number;
    sort?: DataTableSort;
    status?: string;
  }) {
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
        extra: { status: next.status ?? status },
      })}`,
    );
  }

  function listQuery(pageSizeOverride = pageSize, pageOverride = page) {
    return {
      search,
      page: pageOverride,
      pageSize: pageSizeOverride,
      sortKey: sort.key ?? "",
      sortDirection: sort.direction === "desc" ? ("desc" as const) : ("asc" as const),
      status,
    };
  }

  const columns = useMemo<DataTableColumn<PlanListRow>[]>(() => {
    const showDetail = (row: PlanListRow) =>
      overlay.show(<PlanDetailDialog key={`view-${row.id}`} planId={row.id} onClose={overlay.close} />);
    return [
      {
        key: "reference",
        label: "Reference",
        render: (row) => (
          <button type="button" onClick={() => showDetail(row)} className={linkButtonClass}>
            {row.reference}
          </button>
        ),
      },
      { key: "employeeCode", label: "Employee code" },
      { key: "employeeName", label: "Employee name" },
      ...(copy.categoryLabel ? [{ key: "category", label: copy.categoryLabel } as DataTableColumn<PlanListRow>] : []),
      { key: "total", label: "Total", render: (row) => formatMoney(row.total) },
      { key: "installment", label: "Monthly", render: (row) => formatMoney(row.installment) },
      { key: "startPeriod", label: "First month", render: (row) => formatPeriod(row.startPeriod) },
      { key: "recovered", label: "Recovered", render: (row) => formatMoney(row.recovered) },
      {
        key: "outstanding",
        label: "Outstanding",
        render: (row) => (
          <span className={row.outstanding > 0 && row.displayStatus !== "Rejected" ? "font-medium text-zinc-900" : ""}>
            {formatMoney(row.outstanding)}
          </span>
        ),
      },
      {
        key: "displayStatus",
        label: "Status",
        render: (row) => <PlanStatusBadge status={row.displayStatus} />,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <button type="button" onClick={() => showDetail(row)} className={linkButtonClass}>
              {row.status === "Pending" && copy.needsApproval ? "Review" : "View"}
            </button>
            {row.status === "Pending" || row.status === "Active" || row.status === "Paused" ? (
              <button
                type="button"
                onClick={() =>
                  overlay.show(
                    <PlanFormDialog
                      key={`edit-${row.id}`}
                      kind={kind}
                      planId={row.id}
                      nextPeriod={nextPeriod}
                      onClose={overlay.close}
                    />,
                  )
                }
                className={linkButtonClass}
              >
                Edit
              </button>
            ) : null}
            {row.status === "Pending" || row.status === "Active" || row.status === "Paused" ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${copy.noun} ${row.reference} for ${row.employeeName}?`)) {
                    void deletePlanAction(row.id).then((result) => {
                      if ("error" in result && result.error) {
                        window.alert(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }
                }}
                className="text-xs font-medium text-red-600"
              >
                Delete
              </button>
            ) : null}
          </RowActions>
        ),
      },
    ];
  }, [overlay, copy, kind, nextPeriod, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-zinc-800">{copy.title}</h1>
        <p className="text-xs text-zinc-500">{copy.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={copy.needsApproval ? "Awaiting approval" : "Paused"} value={String(copy.needsApproval ? awaiting : paused)} />
        <Tile label="Running" value={String(running)} note={`${completed} completed`} />
        <Tile label="Outstanding" value={formatMoney(outstanding)} />
        <Tile label={`To deduct in ${formatPeriod(nextPeriod)}`} value={formatMoney(Math.round(dueNext * 100) / 100)} />
      </div>

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
        searchPlaceholder={`Search ${copy.plural}…`}
        emptyMessage={totalCount === 0 && !search && !status ? `No ${copy.plural} yet` : "No results"}
        actions={
          <>
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => replaceQuery({ status: event.target.value, page: 1 })}
              className={`${formControlClass} h-9`}
            >
              <option value="">All statuses</option>
              {STATUS_FILTERS.filter((item) => copy.needsApproval || (item !== "Pending" && item !== "Rejected")).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <TableActions
              onExport={() => {
                void listPlansAction(kind, listQuery(100000, 1)).then((result) => {
                  exportTable(`${copy.plural}.csv`, columns, result.rows);
                });
              }}
              exportDisabled={totalCount === 0}
              onAdd={() =>
                overlay.show(
                  <PlanFormDialog key={`new-${Date.now()}`} kind={kind} planId={null} nextPeriod={nextPeriod} onClose={overlay.close} />,
                )
              }
              addLabel={copy.addLabel}
            />
          </>
        }
      />
    </div>
  );
}
