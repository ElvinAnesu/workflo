// CSV parsing for imports (RFC 4180: quoted fields, escaped quotes, CRLF).
// Pure so it can be tested without a browser.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export type CsvImportColumn = {
  key: string;
  header: string;
  required?: boolean;
};

export type CsvRecordsResult = {
  records: Record<string, string>[];
  errors: string[];
};

// Maps CSV rows to records by header name (case and spacing insensitive).
export function csvToRecords(
  text: string,
  columns: CsvImportColumn[],
): CsvRecordsResult {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { records: [], errors: ["The file is empty."] };
  }

  const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const headers = rows[0].map(normalise);
  const indexes = columns.map((column) => headers.indexOf(normalise(column.header)));
  const missing = columns.filter(
    (column, index) => column.required && indexes[index] === -1,
  );

  if (missing.length > 0) {
    return {
      records: [],
      errors: [
        `Missing column${missing.length === 1 ? "" : "s"}: ${missing
          .map((column) => column.header)
          .join(", ")}. Download the template to see the expected headers.`,
      ],
    };
  }

  const errors: string[] = [];
  const records = rows.slice(1).map((cells, rowIndex) => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column.key] = indexes[index] === -1 ? "" : (cells[indexes[index]] ?? "").trim();
      if (column.required && !record[column.key]) {
        errors.push(`Row ${rowIndex + 2}: "${column.header}" is empty.`);
      }
    });
    return record;
  });

  return { records, errors };
}
