import { DeductionPlansRoute } from "@/app/(app)/payroll/plans-route";

export default function AdvancesRoute({ searchParams }: PageProps<"/payroll/advances">) {
  return <DeductionPlansRoute kind="Advance" searchParams={searchParams} />;
}
