"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  exportBranchesAction,
  importBranchesAction,
  setBranchActiveAction,
} from "@/app/(app)/branches/actions";
import { BranchFormDialog } from "@/components/branches/branch-form-dialog";
import type { BranchListRow } from "@/components/branches/branch.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { ImportDialog } from "@/components/table/import-dialog";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type BranchesTableProps = {
  rows: BranchListRow[];
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

export function BranchesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: BranchesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<BranchesTableProps>) {
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
    async (row: BranchListRow) => {
      const activating = !row.isActive;
      const ok = await confirm({
        title: activating ? "Activate branch" : "Deactivate branch",
        message: activating
          ? `Activate ${row.name}?`
          : `Deactivate ${row.name}? It will stay in the list so it can be turned back on.`,
        confirmLabel: activating ? "Activate" : "Deactivate",
        variant: activating ? "default" : "danger",
      });
      if (!ok) {
        return;
      }
      const result = await setBranchActiveAction(row.id, activating);
      if ("error" in result && result.error) {
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<BranchListRow>[]>(
    () => [
      { key: "name", label: "Branch name" },
      { key: "location", label: "Location" },
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
                  <BranchFormDialog
                    key={`edit-${row.id}`}
                    branch={row}
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
    const exported = await exportBranchesAction({
      search,
      sortKey: sort.key ?? "name",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("branches", columns, exported);
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
      searchPlaceholder="Search branches…"
      emptyMessage="No branches yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onImport={() =>
            overlay.show(
              <ImportDialog
                key={`import-${Date.now()}`}
                title="Import branches"
                templateName="branches-template.csv"
                columns={[
                  { key: "name", header: "Branch name", required: true },
                  { key: "location", header: "Location" },
                ]}
                onImport={(records, dryRun) =>
                  importBranchesAction(
                    records.map((record) => ({
                      name: record.name ?? "",
                      location: record.location ?? "",
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
              <BranchFormDialog
                key={`new-${Date.now()}`}
                branch={null}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
