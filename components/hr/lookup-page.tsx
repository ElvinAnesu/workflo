"use client";

import { useMemo, useState } from "react";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import {
  deleteItem,
  getHrState,
  lookupUsage,
  saveLookup,
  useHrState,
  type EmployeeLookupCollection,
  type HrItem,
} from "@/components/hr/hr-store";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn } from "@/components/table/data-table.types";
import { ImportDialog } from "@/components/table/import-dialog";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { useClientTable } from "@/components/table/use-client-table";

export type LookupField = {
  key: string;
  label: string;
  required?: boolean;
};

type LookupPageProps<K extends EmployeeLookupCollection> = {
  collection: K;
  singular: string;
  plural: string;
  fields: LookupField[];
  importable?: boolean;
};

type Row = { id: string } & Record<string, string>;

function LookupDialog<K extends EmployeeLookupCollection>({
  collection,
  singular,
  fields,
  item,
  onClose,
}: {
  collection: K;
  singular: string;
  fields: LookupField[];
  item: Row | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, item?.[field.key] ?? ""])),
  );
  const [error, setError] = useState("");

  function handleSubmit() {
    const missing = fields.find((field) => field.required && !form[field.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    const trimmed = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    );
    const result = saveLookup(collection, {
      ...trimmed,
      id: item?.id,
    } as unknown as Omit<HrItem<K>, "id"> & { id?: string });
    if (result) {
      setError(result);
      return;
    }
    onClose();
  }

  return (
    <FormDialogFrame
      title={item ? `Update ${singular}` : `Add ${singular}`}
      submitLabel={item ? "Save" : "Add"}
      onSubmit={handleSubmit}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        {fields.map((field) => (
          <FormField key={field.key} label={`${field.label}${field.required ? " *" : ""}`}>
            <input
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className={formControlClass}
            />
          </FormField>
        ))}
        {item ? (
          <p className="text-xs text-zinc-500 sm:col-span-4">
            Renaming updates every employee assigned to this {singular}.
          </p>
        ) : null}
      </div>
    </FormDialogFrame>
  );
}

export function LookupPage<K extends EmployeeLookupCollection>({
  collection,
  singular,
  plural,
  fields,
  importable,
}: LookupPageProps<K>) {
  const overlay = useOverlayDialog();
  const state = useHrState();
  const rows = state[collection] as unknown as Row[];
  const table = useClientTable<Row>(rows, fields.map((field) => field.key));
  const { page, pageSize } = table;

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      ...fields.map((field) => ({ key: field.key, label: field.label })),
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <LookupDialog
                  key={`edit-${row.id}`}
                  collection={collection}
                  singular={singular}
                  fields={fields}
                  item={row}
                  onClose={overlay.close}
                />,
              )
            }
            onDelete={() => {
              const usage = lookupUsage(collection, row as unknown as HrItem<K>);
              if (usage) {
                window.alert(`This ${singular} cannot be deleted. ${usage}`);
                return;
              }
              if (window.confirm(`Delete this ${singular}?`)) {
                deleteItem(collection, row.id);
              }
            }}
          />
        ),
      },
    ],
    [collection, fields, overlay, page, pageSize, singular],
  );

  function handleImport(records: Record<string, string>[], dryRun: boolean) {
    const nameKey = fields[0].key;
    const existing = new Set(
      (getHrState()[collection] as unknown as Row[]).map((row) =>
        row[nameKey].toLowerCase(),
      ),
    );
    const seen = new Set<string>();
    const problems: string[] = [];
    records.forEach((record, index) => {
      const name = record[nameKey].toLowerCase();
      if (existing.has(name)) {
        problems.push(`Row ${index + 2}: "${record[nameKey]}" already exists.`);
      } else if (seen.has(name)) {
        problems.push(`Row ${index + 2}: "${record[nameKey]}" appears twice in the file.`);
      }
      seen.add(name);
    });
    if (problems.length === 0 && !dryRun) {
      for (const record of records) {
        saveLookup(collection, record as unknown as Omit<HrItem<K>, "id">);
      }
    }
    return problems;
  }

  return (
    <DataTable
      {...table}
      columns={columns}
      searchPlaceholder={`Search ${plural.toLowerCase()}…`}
      emptyMessage={`No ${plural.toLowerCase()} yet`}
      actions={
        <TableActions
          onExport={() => exportTable(`${plural.toLowerCase().replace(/\s+/g, "-")}.csv`, columns, table.allRows)}
          exportDisabled={rows.length === 0}
          onImport={
            importable
              ? () =>
                  overlay.show(
                    <ImportDialog
                      key={`import-${Date.now()}`}
                      title={`Import ${plural.toLowerCase()}`}
                      templateName={`${plural.toLowerCase().replace(/\s+/g, "-")}-template.csv`}
                      columns={fields.map((field) => ({
                        key: field.key,
                        header: field.label,
                        required: field.required,
                      }))}
                      onImport={handleImport}
                      onClose={overlay.close}
                    />,
                  )
              : undefined
          }
          onAdd={() =>
            overlay.show(
              <LookupDialog
                key={`new-${Date.now()}`}
                collection={collection}
                singular={singular}
                fields={fields}
                item={null}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
