import { OvertimeRunDetail } from "@/components/payroll/overtime/overtime-run-detail";
import { getOvertimeRun } from "@/server/payroll-operations";

export default async function OvertimeRunRoute({ params }: PageProps<"/payroll/overtime/[runId]">) {
  const { runId } = await params;
  const detail = await getOvertimeRun(Number(runId));
  if ("error" in detail) {
    return <OvertimeRunDetail run={null} />;
  }
  return <OvertimeRunDetail run={detail} />;
}
