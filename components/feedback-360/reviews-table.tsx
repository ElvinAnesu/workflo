"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { CopyLinkButton } from "@/components/feedback-360/copy-link-button";
import {
  feedbackLink,
  useFeedback360State,
} from "@/components/feedback-360/feedback-360-store";
import type { FeedbackReview } from "@/components/feedback-360/feedback-360.types";
import { ReviewFormDialog } from "@/components/feedback-360/review-form-dialog";
import { ReviewStatusBadge } from "@/components/feedback-360/review-status-badge";
import { formControlClass } from "@/components/form/form-control";
import { queryClientRows } from "@/components/table/client-table-query";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";

const PAGE_SIZE_DEFAULT = 10;

type ReviewTableRow = FeedbackReview & { responses: number };

export function ReviewsTable() {
  const overlay = useOverlayDialog();
  const { reviews, responses } = useFeedback360State();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [sort, setSort] = useState<DataTableSort>({
    key: null,
    direction: null,
  });

  const tableRows = useMemo<ReviewTableRow[]>(
    () =>
      reviews.map((review) => ({
        ...review,
        responses: responses.filter((r) => r.reviewId === review.id).length,
      })),
    [reviews, responses],
  );

  const { rows, totalCount } = queryClientRows(
    status ? tableRows.filter((row) => row.status === status) : tableRows,
    {
      search,
      searchKeys: ["id", "employeeName", "jobTitle", "department"],
      sort,
      page,
      pageSize,
    },
  );

  const columns = useMemo<DataTableColumn<ReviewTableRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "id", label: "Review" },
      { key: "employeeName", label: "Employee" },
      { key: "jobTitle", label: "Job title" },
      { key: "department", label: "Department" },
      { key: "createdOn", label: "Created" },
      { key: "dueDate", label: "Due" },
      { key: "responses", label: "Responses" },
      {
        key: "status",
        label: "Status",
        render: (row) => <ReviewStatusBadge status={row.status} />,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <Link
              href={`/feedback-360/${row.id}`}
              className="text-xs font-medium text-[#1E40AF]"
            >
              View results
            </Link>
            {row.status === "Collecting" ? (
              <CopyLinkButton
                link={feedbackLink(row.token)}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 [&>svg]:size-3.5"
              />
            ) : null}
          </RowActions>
        ),
      },
    ],
    [page, pageSize],
  );

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleSort(key: string) {
    setPage(1);
    setSort((current) => {
      if (current.key !== key) {
        return { key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key: null, direction: null };
    });
  }

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      search={search}
      sort={sort}
      onSearch={handleSearch}
      onSort={handleSort}
      onPageChange={setPage}
      onPageSizeChange={handlePageSizeChange}
      searchPlaceholder="Search 360 reviews…"
      emptyMessage="No 360 reviews yet. Create one to get an anonymous feedback link."
      actions={
        <>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className={formControlClass}
          >
            <option value="">All statuses</option>
            <option value="Collecting">Collecting</option>
            <option value="Closed">Closed</option>
          </select>
          <button
            type="button"
            onClick={() =>
              overlay.show(
                <ReviewFormDialog
                  key={`new-${Date.now()}`}
                  onClose={overlay.close}
                />,
              )
            }
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            New 360 review
          </button>
        </>
      }
    />
  );
}
