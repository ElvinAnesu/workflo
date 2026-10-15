"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  exportDepartmentsAction,
  importDepartmentsAction,
  setDepartmentActiveAction,
} from "@/app/(app)/departments/actions";
import { DepartmentFormDialog } from "@/components/departments/department-form-dialog";
import type { DepartmentListRow } from "@/components/departments/department.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { ImportDialog } from "@/components/table/import-dialog";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type DepartmentsTableProps = {
  rows: DepartmentListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
};

function queryString(values: {
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
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
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function DepartmentsTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: DepartmentsTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<DepartmentsTableProps>) {
    router.push(
      `${pathname}${queryString({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const toggleActive = useCallback(
    async (row: DepartmentListRow) => {
      const activating = !row.isActive;
      const ok = await confirm({
        title: activating ? "Activate department" : "Deactivate department",
        message: activating
          ? `Activate ${row.name}?`
          : `Deactivate ${row.name}? It will stay in the list so it can be turned back on.`,
        confirmLabel: activating ? "Activate" : "Deactivate",
        variant: activating ? "default" : "danger",
      });
      if (!ok) {
        return;
      }
      const result = await setDepartmentActiveAction(row.id, activating);
      if ("error" in result && result.error) {
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<DepartmentListRow>[]>(
    () => [
      { key: "name", label: "Department name" },
      { key: "code", label: "Description" },
      {
        key: "isActive",
        label: "Status",
        render: (row) => (row.isActive ? "Active" : "Inactive"),
        exportValue: (row) => (row.isActive ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        exportValue: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <DepartmentFormDialog
                    key={`edit-${row.id}`}
                    department={row}
                    onClose={overlay.close}
                  />,
                )
              }
              className="text-xs font-medium text-[#1E40AF]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                void toggleActive(row);
              }}
              className={
                row.isActive
                  ? "text-xs font-medium text-red-600"
                  : "text-xs font-medium text-[#1E40AF]"
              }
            >
              {row.isActive ? "Deactivate" : "Activate"}
            </button>
          </RowActions>
        ),
      },
    ],
    [overlay, toggleActive],
  );

  async function handleExport() {
    const exported = await exportDepartmentsAction({
      search,
      sortKey: sort.key ?? "name",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("departments", columns, exported);
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
      onPageSizeChange={(nextSize) =>
        replaceQuery({ pageSize: nextSize, page: 1 })
      }
      searchPlaceholder="Search departments…"
      emptyMessage="No departments yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onImport={() =>
            overlay.show(
              <ImportDialog
                key={`import-${Date.now()}`}
                title="Import departments"
                templateName="departments-template.csv"
                columns={[
                  { key: "name", header: "Department name", required: true },
                  { key: "code", header: "Description" },
                ]}
                onImport={(records, dryRun) =>
                  importDepartmentsAction(
                    records.map((record) => ({
                      name: record.name ?? "",
                      code: record.code ?? "",
                    })),
                    dryRun,
                  )
                }
                onClose={() => {
                  overlay.close();
                  router.refresh();
                }}
              />,
            )
          }
          onAdd={() =>
            overlay.show(
              <DepartmentFormDialog
                key={`new-${Date.now()}`}
                department={null}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
