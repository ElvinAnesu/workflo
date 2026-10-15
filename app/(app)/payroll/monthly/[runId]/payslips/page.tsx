import { PayslipsPrintView } from "@/components/payroll/payslips-print-view";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import { getMonthlyRun } from "@/server/payroll-operations";

export default async function PayrollRunPayslipsRoute({
  params,
  searchParams,
}: PageProps<"/payroll/monthly/[runId]/payslips">) {
  const { runId } = await params;
  const { employees } = await searchParams;
  const employeeIds = typeof employees === "string" ? employees.split(",").filter(Boolean) : [];
  const detail = await getMonthlyRun(Number(runId), "");
  if ("error" in detail) {
    return <PayslipsPrintView keys={[]} backHref="/payroll/monthly" backLabel="Monthly payroll" missing />;
  }
  const ids = employeeIds.length > 0 ? employeeIds : detail.run.lines.map((line) => line.employeeId);
  const keys = ids.map((id) => `${runId}:${id}`);
  return (
    <PayslipsPrintView
      keys={keys}
      backHref={`/payroll/monthly/${runId}`}
      backLabel={`Payroll · ${formatPeriod(detail.run.period)}`}
    />
  );
}
