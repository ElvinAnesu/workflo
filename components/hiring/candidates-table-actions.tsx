import { Download, Plus } from "lucide-react";
import { formControlClass } from "@/components/form/form-control";
import { CANDIDATE_LIST_STATUSES } from "@/components/hiring/hiring.types";

type CandidatesTableActionsProps = {
  status: string;
  onStatusChange: (status: string) => void;
  onAdd: () => void;
  onExport: () => void;
};

export function CandidatesTableActions({
  status,
  onStatusChange,
  onAdd,
  onExport,
}: CandidatesTableActionsProps) {
  return (
    <>
      <select
        aria-label="Filter by status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        className={formControlClass}
      >
        <option value="">All statuses</option>
        {CANDIDATE_LIST_STATUSES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onExport}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#22C55E] px-3 text-sm font-medium text-white"
      >
        <Download className="size-4" />
        Export
      </button>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
      >
        <Plus className="size-4" />
        Add
      </button>
    </>
  );
}
