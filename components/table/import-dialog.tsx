"use client";

import { Download, FileUp } from "lucide-react";
import { useState } from "react";
import {
  FormDialogFrame,
  secondaryButtonClass,
} from "@/components/form/form-dialog-frame";
import { downloadCsv } from "@/components/payroll/csv-export";
import { csvToRecords, type CsvImportColumn } from "@/components/table/csv";

type ImportDialogProps = {
  title: string;
  templateName: string;
  columns: CsvImportColumn[];
  // Validates and saves the parsed records; returns per-row problems.
  // Called with dryRun first so problems are shown before anything is saved.
  onImport: (
    records: Record<string, string>[],
    dryRun: boolean,
  ) => string[] | Promise<string[]>;
  onClose: () => void;
};

export function ImportDialog({
  title,
  templateName,
  columns,
  onImport,
  onClose,
}: ImportDialogProps) {
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(0);

  async function handleFile(file: File | undefined) {
    setDone(0);
    if (!file) {
      return;
    }
    setFileName(file.name);
    const parsed = csvToRecords(await file.text(), columns);
    // Report every problem in one pass: missing cells and business rules.
    const problems = [...parsed.errors];
    if (parsed.records.length > 0) {
      problems.push(...(await Promise.resolve(onImport(parsed.records, true))));
    }
    setRecords(problems.length === 0 ? parsed.records : []);
    setErrors(problems);
  }

  async function handleSubmit() {
    if (records.length === 0) {
      setErrors(errors.length > 0 ? errors : ["Choose a CSV file to import."]);
      return;
    }
    const problems = await Promise.resolve(onImport(records, false));
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setDone(records.length);
    setRecords([]);
  }

  return (
    <FormDialogFrame
      title={title}
      submitLabel={records.length > 0 ? `Import ${records.length} rows` : "Import"}
      onSubmit={
        done > 0
          ? onClose
          : () => {
              void handleSubmit();
            }
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 p-4 text-xs text-zinc-600">
        <p>
          Upload a CSV file (Excel: File → Save As → CSV). The first row must
          contain these headers:{" "}
          <span className="font-medium text-zinc-800">
            {columns
              .map((column) => `${column.header}${column.required ? " *" : ""}`)
              .join(", ")}
          </span>
          . Columns marked * are required.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv(templateName, columns.map((column) => column.header), [])
            }
            className={secondaryButtonClass}
          >
            <Download className="size-4" />
            Download template
          </button>
          <label className={`${secondaryButtonClass} cursor-pointer`}>
            <FileUp className="size-4" />
            {fileName || "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </label>
        </div>
        {records.length > 0 ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
            {records.length} row{records.length === 1 ? "" : "s"} ready to import.
          </p>
        ) : null}
        {done > 0 ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
            Imported {done} row{done === 1 ? "" : "s"}.
          </p>
        ) : null}
        {errors.length > 0 ? (
          <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
            <p className="font-medium">Nothing was imported. Fix these and try again:</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.slice(0, 20).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            {errors.length > 20 ? <p className="mt-1">…and {errors.length - 20} more.</p> : null}
          </div>
        ) : null}
      </div>
    </FormDialogFrame>
  );
}
