import { MidMonthRunDetail } from "@/components/payroll/mid-month/mid-month-run-detail";
import { getMidMonthRun } from "@/server/payroll-operations";

export default async function MidMonthRunRoute({ params }: PageProps<"/payroll/mid-month/[runId]">) {
  const { runId } = await params;
  const detail = await getMidMonthRun(Number(runId));
  if ("error" in detail) {
    return <MidMonthRunDetail run={null} />;
  }
  return <MidMonthRunDetail run={detail} />;
}
