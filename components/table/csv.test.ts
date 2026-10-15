import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { csvToRecords, parseCsv } from "./csv.ts";

describe("parseCsv", () => {
  test("handles quotes, escaped quotes, commas and CRLF", () => {
    assert.deepEqual(
      parseCsv('Name,Location\r\n"Ilala, DSM","He said ""hi"""\r\nArusha,North\r\n'),
      [
        ["Name", "Location"],
        ["Ilala, DSM", 'He said "hi"'],
        ["Arusha", "North"],
      ],
    );
  });

  test("strips a UTF-8 BOM and skips blank lines", () => {
    assert.deepEqual(parseCsv("﻿A,B\n\n1,2"), [
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  test("keeps line breaks inside quoted fields", () => {
    assert.deepEqual(parseCsv('A\n"line 1\nline 2"'), [["A"], ["line 1\nline 2"]]);
  });
});

describe("csvToRecords", () => {
  const columns = [
    { key: "branchName", header: "Branch name", required: true },
    { key: "location", header: "Location" },
  ];

  test("matches headers regardless of case and spacing", () => {
    const result = csvToRecords("BRANCH  NAME,location\nHQ,Dar", columns);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.records, [{ branchName: "HQ", location: "Dar" }]);
  });

  test("reports missing required columns and empty required cells", () => {
    assert.match(csvToRecords("Location\nDar", columns).errors[0], /Missing column: Branch name/);
    assert.deepEqual(csvToRecords("Branch name,Location\n,Dar", columns).errors, [
      'Row 2: "Branch name" is empty.',
    ]);
  });

  test("treats an optional missing column as empty", () => {
    assert.deepEqual(csvToRecords("Branch name\nHQ", columns).records, [
      { branchName: "HQ", location: "" },
    ]);
  });
});
