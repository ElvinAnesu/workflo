import { DeductionPlansRoute } from "@/app/(app)/payroll/plans-route";

export default function RecoveriesRoute({ searchParams }: PageProps<"/payroll/recoveries">) {
  return <DeductionPlansRoute kind="Recovery" searchParams={searchParams} />;
}
