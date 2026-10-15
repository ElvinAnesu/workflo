import { PayrollRunDetail } from "@/components/payroll/payroll-run-detail";
import { firstParam } from "@/components/payroll/list-query";
import { getMonthlyRun } from "@/server/payroll-operations";

export default async function PayrollRunRoute({
  params,
  searchParams,
}: PageProps<"/payroll/monthly/[runId]">) {
  const { runId } = await params;
  const query = await searchParams;
  const search = firstParam(query.search) ?? "";
  const detail = await getMonthlyRun(Number(runId), search);
  if ("error" in detail) {
    return <PayrollRunDetail run={null} notices={[]} search={search} />;
  }

  return <PayrollRunDetail run={detail.run} notices={detail.notices} search={search} />;
}
