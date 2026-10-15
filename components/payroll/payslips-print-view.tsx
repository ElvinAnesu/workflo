"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompanyState } from "@/components/company/company-store";
import { linkButtonClass, primaryButtonClass } from "@/components/form/form-dialog-frame";
import { payslipLinesAction } from "@/app/(app)/payroll/actions";
import type { PayrollLine, PayrollRunStatus } from "@/components/payroll/payroll.types";
import { PayslipDocument } from "@/components/payroll/payslip-document";

type PrintedLine = PayrollLine & {
  employeeCode?: string;
  period: string;
  runStatus: PayrollRunStatus;
  contributionColumns: PayrollLine["contributions"] extends never ? never : { contributionId: string; code: string; name: string }[];
};

export function PayslipsPrintView({
  keys,
  backHref,
  backLabel,
  missing,
}: {
  keys: string[];
  backHref: string;
  backLabel: string;
  missing?: boolean;
}) {
  const company = useCompanyState();
  const [lines, setLines] = useState<PrintedLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (missing || keys.length === 0) {
      setLoaded(true);
      return;
    }
    void payslipLinesAction(keys).then((result) => {
      if ("lines" in result) {
        setLines(result.lines as PrintedLine[]);
      }
      setLoaded(true);
    });
  }, [keys, missing]);

  if (missing) {
    return <p className="text-sm text-zinc-500">This payroll was not found.</p>;
  }

  const period = lines[0]?.period ?? "";
  const status = lines[0]?.runStatus;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link href={backHref} className={`${linkButtonClass} inline-flex items-center gap-1`}>
            <ArrowLeft className="size-3.5" />
            {backLabel}
          </Link>
          <p className="text-xs text-zinc-500">
            {lines.length} payslip{lines.length === 1 ? "" : "s"}
            {status && status !== "Locked" ? " · not final until the payroll is locked" : ""}
          </p>
        </div>
        <button type="button" onClick={() => window.print()} disabled={lines.length === 0} className={primaryButtonClass}>
          <Printer className="size-4" />
          Print / Save as PDF
        </button>
      </div>
      {!loaded ? (
        <p className="text-sm text-zinc-500">Loading payslips…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-zinc-500">No payslips match.</p>
      ) : (
        <div className="flex flex-col gap-6 print:gap-0">
          {lines.map((line) => (
            <PayslipDocument
              key={`${line.period}-${line.employeeId}`}
              run={{ period: line.period, status: line.runStatus }}
              line={line}
              companyName={company.companyName}
              companyAddress={[company.address, company.country].filter(Boolean).join(", ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
