"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { exportHiringRequestsAction } from "@/app/(app)/hiring/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { HiringRequestDetailDialog } from "@/components/hiring/hiring-request-detail-dialog";
import { HiringRequestFormDialog } from "@/components/hiring/hiring-request-form-dialog";
import { HiringRequestsTableActions } from "@/components/hiring/hiring-requests-table-actions";
import { HiringStatusBadge } from "@/components/hiring/hiring-status-badge";
import type { HiringFormOptions, HiringRequestListRow } from "@/components/hiring/hiring.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions } from "@/components/table/table-actions";

type HiringRequestsTableProps = {
  rows: HiringRequestListRow[];
  totalCount: number;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  options: HiringFormOptions;
};

function queryString(values: {
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  if (values.status) {
    params.set("status", values.status);
  }
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function positionsValue(row: HiringRequestListRow) {
  return row.status === "Pending approval" || row.status === "Rejected"
    ? String(row.positions)
    : `${row.seatsTaken} / ${row.positions}`;
}

export function HiringRequestsTable({
  rows,
  totalCount,
  status,
  search,
  page,
  pageSize,
  sort,
  options,
}: HiringRequestsTableProps) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<HiringRequestsTableProps>) {
    router.push(
      `${pathname}${queryString({
        status: next.status ?? status,
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<HiringRequestListRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "id", label: "Request no.", render: (row) => row.number, exportValue: (row) => row.number },
      { key: "jobTitle", label: "Job title" },
      { key: "department", label: "Department", render: (row) => row.departmentName, exportValue: (row) => row.departmentName },
      { key: "branch", label: "Branch", render: (row) => row.branchName, exportValue: (row) => row.branchName },
      { key: "positions", label: "Positions", render: (row) => positionsValue(row), exportValue: (row) => positionsValue(row) },
      {
        key: "candidates",
        label: "Candidates",
        sortable: false,
        render: (row) => row.candidateCount,
        exportValue: (row) => row.candidateCount,
      },
      { key: "requestedBy", label: "Requested by" },
      { key: "requestedOn", label: "Requested on" },
      {
        key: "status",
        label: "Status",
        render: (row) => <HiringStatusBadge status={row.status} />,
        exportValue: (row) => row.status,
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
                  <HiringRequestDetailDialog
                    key={`view-${row.id}`}
                    requestId={row.id}
                    options={options}
                    onClose={overlay.close}
                  />,
                )
              }
              className="text-xs font-medium text-[#1E40AF]"
            >
              {row.status === "Pending approval" ? "Review" : "Open"}
            </button>
            {row.status === "Pending approval" ? (
              <button
                type="button"
                onClick={() =>
                  overlay.show(
                    <HiringRequestFormDialog
                      key={`edit-${row.id}`}
                      request={row}
                      options={options}
                      onClose={overlay.close}
                    />,
                  )
                }
                className="text-xs font-medium text-zinc-600"
              >
                Edit
              </button>
            ) : null}
          </RowActions>
        ),
      },
    ],
    [options, overlay, page, pageSize],
  );

  async function handleExport() {
    const exported = await exportHiringRequestsAction({
      status,
      search,
      sortKey: sort.key ?? "",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("hiring-requests.csv", columns, exported);
  }

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
      onSort={(key) => {
        const nextSort: DataTableSort =
          sort.key !== key
            ? { key, direction: "asc" }
            : sort.direction === "asc"
              ? { key, direction: "desc" }
              : { key: null, direction: null };
        replaceQuery({ sort: nextSort, page: 1 });
      }}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search hiring requests…"
      emptyMessage="No hiring requests"
      actions={
        <HiringRequestsTableActions
          status={status}
          onStatusChange={(value) => replaceQuery({ status: value, page: 1 })}
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <HiringRequestFormDialog key={`new-${Date.now()}`} request={null} options={options} onClose={overlay.close} />,
            )
          }
        />
      }
    />
  );
}
