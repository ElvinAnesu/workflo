"use client";

import { useMemo } from "react";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { deleteItem, getHrState, useHrState } from "@/components/hr/hr-store";
import { KpiFormDialog } from "@/components/kpis/kpi-form-dialog";
import type { KpiRow } from "@/components/kpis/kpi.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { useClientTable } from "@/components/table/use-client-table";

export function KpisTable() {
  const overlay = useOverlayDialog();
  const { kpis } = useHrState();
  const table = useClientTable(kpis, ["kpiName", "unit", "direction", "appliesTo"]);

  const columns = useMemo<DataTableColumn<KpiRow>[]>(
    () => [
      { key: "kpiName", label: "KPI name" },
      { key: "unit", label: "Unit" },
      { key: "direction", label: "Direction" },
      { key: "appliesTo", label: "Applies to" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(<KpiFormDialog key={`edit-${row.id}`} kpi={row} onClose={overlay.close} />)
            }
            onDelete={() => {
              const used = getHrState().scorecards.filter((item) => item.kpiId === row.id).length;
              if (used > 0) {
                window.alert(`${row.kpiName} cannot be deleted because ${used} scorecard entr${used === 1 ? "y uses" : "ies use"} it.`);
                return;
              }
              if (window.confirm(`Delete the ${row.kpiName} KPI?`)) {
                deleteItem("kpis", row.id);
              }
            }}
          />
        ),
      },
    ],
    [overlay],
  );

  return (
    <DataTable
      {...table}
      columns={columns}
      searchPlaceholder="Search KPIs…"
      emptyMessage="No KPIs yet"
      actions={
        <TableActions
          onExport={() => exportTable("kpis.csv", columns, table.allRows)}
          exportDisabled={kpis.length === 0}
          onAdd={() =>
            overlay.show(<KpiFormDialog key={`new-${Date.now()}`} kpi={null} onClose={overlay.close} />)
          }
        />
      }
    />
  );
}
