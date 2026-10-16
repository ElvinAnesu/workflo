"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  exportCompaniesAction,
  setCompanyActiveAction,
} from "@/app/(app)/company/actions";
import { CompanyFormDialog } from "@/components/company/company-form-dialog";
import type { CompanyListRow } from "@/components/company/company.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions, usePageCan } from "@/components/table/table-actions";

type CompaniesTableProps = {
  rows: CompanyListRow[];
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

export function CompaniesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: CompaniesTableProps) {
  const overlay = useOverlayDialog();
  const canEdit = usePageCan("edit");
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<CompaniesTableProps>) {
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
    async (row: CompanyListRow) => {
      const activating = !row.isActive;
      const ok = await confirm({
        title: activating ? "Activate company" : "Deactivate company",
        message: activating
          ? `Activate ${row.name}?`
          : `Deactivate ${row.name}? It will stay in the list so it can be turned back on.`,
        confirmLabel: activating ? "Activate" : "Deactivate",
        variant: activating ? "default" : "danger",
      });
      if (!ok) {
        return;
      }
      const result = await setCompanyActiveAction(row.id, activating);
      if ("error" in result && result.error) {
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<CompanyListRow>[]>(
    () => [
      { key: "name", label: "Company name" },
      { key: "country", label: "Country" },
      { key: "address", label: "Address" },
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
        render: (row) => canEdit ? (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <CompanyFormDialog company={row} onClose={overlay.close} />,
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
        ) : null,
      },
    ],
    [canEdit, overlay, toggleActive],
  );

  async function handleExport() {
    const exported = await exportCompaniesAction({
      search,
      sortKey: sort.key ?? "name",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("companies", columns, exported);
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
      searchPlaceholder="Search companies…"
      emptyMessage="No companies"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <CompanyFormDialog company={null} onClose={overlay.close} />,
            )
          }
        />
      }
    />
  );
}
