import "server-only";
import {
  CANDIDATE_SOURCES,
  CANDIDATE_STATUSES,
  HIRING_REQUEST_REASONS,
  HIRING_REQUEST_STATUSES,
  type CandidateStatus,
  type HiringCandidateListRow,
  type HiringCandidateSaveInput,
  type HiringFormOptions,
  type HiringListQuery,
  type HiringRequestListRow,
  type HiringRequestReason,
  type HiringRequestSaveInput,
  type HiringRequestStatus,
} from "@/components/hiring/hiring.types";
import { getPool, sql } from "./db";
import { listEmployeeFormOptions, peekNextEmployeeCode } from "./employees";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

const REQUEST_NUMBER = `
  CASE
    WHEN r.id < 10000 THEN CONCAT(N'REQ-', RIGHT(CONCAT(N'0000', CONVERT(VARCHAR(10), r.id)), 4))
    ELSE CONCAT(N'REQ-', CONVERT(VARCHAR(10), r.id))
  END
`;

const CANDIDATE_NUMBER = `
  CASE
    WHEN c.id < 10000 THEN CONCAT(N'CAN-', RIGHT(CONCAT(N'0000', CONVERT(VARCHAR(10), c.id)), 4))
    ELSE CONCAT(N'CAN-', CONVERT(VARCHAR(10), c.id))
  END
`;

const PERSON_NAME = `LTRIM(RTRIM(CONCAT(c.first_name, N' ', CASE WHEN c.middle_name IS NULL OR c.middle_name = N'' THEN N'' ELSE c.middle_name + N' ' END, c.last_name)))`;

const REQUEST_LABEL = `CONCAT((${REQUEST_NUMBER}), N' · ', r.job_title, N' (', d.name, N')')`;

const SEAT_COUNT = `
  (
    SELECT COUNT(*)
    FROM dbo.hiring_candidates AS seat
    WHERE seat.hiring_request_id = r.id
      AND seat.company_id = r.company_id
      AND seat.status IN (N'Selected', N'Hire confirmed', N'Converted')
  )
`;

const CANDIDATE_COUNT = `
  (
    SELECT COUNT(*)
    FROM dbo.hiring_candidates AS allc
    WHERE allc.hiring_request_id = r.id
      AND allc.company_id = r.company_id
  )
`;

const REQUEST_FROM = `
  FROM dbo.hiring_requests AS r
  INNER JOIN dbo.departments AS d
    ON d.id = r.department_id AND d.company_id = r.company_id
  LEFT JOIN dbo.branches AS b
    ON b.id = r.branch_id AND b.company_id = r.company_id
  LEFT JOIN dbo.employment_types AS et
    ON et.id = r.employment_type_id AND et.company_id = r.company_id
  LEFT JOIN dbo.employee_categories AS ec
    ON ec.id = r.employee_category_id AND ec.company_id = r.company_id
`;

const REQUEST_SORT: Record<string, string> = {
  id: "r.id",
  jobTitle: "r.job_title",
  department: "d.name",
  branch: "b.name",
  positions: "r.positions",
  requestedBy: "r.requested_by",
  requestedOn: "r.requested_on",
  status: "r.status",
};

const CANDIDATE_SORT: Record<string, string> = {
  id: "c.id",
  name: PERSON_NAME,
  email: "c.email",
  phone: "c.phone",
  request: REQUEST_LABEL,
  source: "c.source",
  addedOn: "c.added_on",
  status: "c.status",
};

const REQUEST_COLUMNS = `
  r.id,
  ${REQUEST_NUMBER} AS request_number,
  r.job_title,
  r.department_id,
  d.name AS department_name,
  r.branch_id,
  b.name AS branch_name,
  r.employment_type_id,
  et.name AS employment_type_name,
  r.employee_category_id,
  ec.name AS employee_category_name,
  r.positions,
  ${SEAT_COUNT} AS seats_taken,
  ${CANDIDATE_COUNT} AS candidate_count,
  r.reason,
  r.justification,
  r.desired_start_date,
  r.requested_by,
  r.requested_on,
  r.status,
  r.decision_by,
  r.decision_on,
  r.decision_comment
`;

type RequestSqlRow = {
  id: number;
  request_number: string;
  job_title: string;
  department_id: number;
  department_name: string;
  branch_id: number | null;
  branch_name: string | null;
  employment_type_id: number | null;
  employment_type_name: string | null;
  employee_category_id: number | null;
  employee_category_name: string | null;
  positions: number;
  seats_taken: number;
  candidate_count: number;
  reason: HiringRequestReason;
  justification: string;
  desired_start_date: Date | string | null;
  requested_by: string;
  requested_on: Date | string;
  status: HiringRequestStatus;
  decision_by: string | null;
  decision_on: Date | string | null;
  decision_comment: string;
};

type CandidateSqlRow = {
  id: number;
  candidate_number: string;
  hiring_request_id: number;
  request_number: string;
  request_label: string;
  job_title: string;
  request_status: HiringRequestStatus;
  request_positions: number;
  seats_taken: number;
  desired_start_date: Date | string | null;
  department_id: number;
  branch_id: number | null;
  employment_type_id: number | null;
  employee_category_id: number | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  person_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  cv_file_name: string;
  notes: string;
  added_on: Date | string;
  status: CandidateStatus;
  start_date: Date | string | null;
  employee_id: number | null;
  employee_code: string | null;
};

const CANDIDATE_FROM = `
  FROM dbo.hiring_candidates AS c
  INNER JOIN dbo.hiring_requests AS r
    ON r.id = c.hiring_request_id AND r.company_id = c.company_id
  INNER JOIN dbo.departments AS d
    ON d.id = r.department_id AND d.company_id = r.company_id
  LEFT JOIN dbo.employees AS e
    ON e.id = c.employee_id AND e.company_id = c.company_id
`;

const CANDIDATE_COLUMNS = `
  c.id,
  ${CANDIDATE_NUMBER} AS candidate_number,
  c.hiring_request_id,
  ${REQUEST_NUMBER} AS request_number,
  ${REQUEST_LABEL} AS request_label,
  r.job_title,
  r.status AS request_status,
  r.positions AS request_positions,
  ${SEAT_COUNT} AS seats_taken,
  r.desired_start_date,
  r.department_id,
  r.branch_id,
  r.employment_type_id,
  r.employee_category_id,
  c.first_name,
  c.middle_name,
  c.last_name,
  ${PERSON_NAME} AS person_name,
  c.email,
  c.phone,
  c.source,
  c.cv_file_name,
  c.notes,
  c.added_on,
  c.status,
  c.start_date,
  c.employee_id,
  e.employee_code
`;

async function requireCompany(): Promise<CompanySession | { error: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }
  return session as CompanySession;
}

function errorNumber(error: unknown) {
  return error && typeof error === "object" && "number" in error
    ? Number((error as { number: unknown }).number)
    : NaN;
}

function isForeignKeyError(error: unknown) {
  return errorNumber(error) === 547;
}

function text(value: string | null | undefined) {
  return value ?? "";
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true as const, value: null as string | null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false as const, error: `${label} is not a valid date.` };
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false as const, error: `${label} is not a valid date.` };
  }
  return { ok: true as const, value: trimmed };
}

function pageSizeOf(value: number) {
  return [10, 20, 50, 100].includes(value) ? value : 10;
}

function requestOrder(sortKey: string, sortDirection: "asc" | "desc") {
  const column = REQUEST_SORT[sortKey];
  if (!column) {
    return "r.id DESC";
  }
  return `${column} ${sortDirection === "desc" ? "DESC" : "ASC"}, r.id ASC`;
}

function candidateOrder(sortKey: string, sortDirection: "asc" | "desc") {
  const column = CANDIDATE_SORT[sortKey];
  if (!column) {
    return "c.id DESC";
  }
  return `${column} ${sortDirection === "desc" ? "DESC" : "ASC"}, c.id ASC`;
}

function requestStatus(value: string) {
  return (HIRING_REQUEST_STATUSES as readonly string[]).includes(value) ? value : "";
}

function candidateStatus(value: string) {
  return (CANDIDATE_STATUSES as readonly string[]).includes(value) && value !== "Converted" ? value : "";
}

function mapRequest(row: RequestSqlRow): HiringRequestListRow {
  return {
    id: row.id,
    number: row.request_number,
    jobTitle: row.job_title,
    departmentId: row.department_id,
    departmentName: row.department_name,
    branchId: row.branch_id,
    branchName: text(row.branch_name),
    employmentTypeId: row.employment_type_id,
    employmentTypeName: text(row.employment_type_name),
    employeeCategoryId: row.employee_category_id,
    employeeCategoryName: text(row.employee_category_name),
    positions: row.positions,
    seatsTaken: row.seats_taken,
    candidateCount: row.candidate_count,
    reason: row.reason,
    justification: row.justification,
    desiredStartDate: formatDate(row.desired_start_date),
    requestedBy: row.requested_by,
    requestedOn: formatDate(row.requested_on),
    status: row.status,
    decisionBy: text(row.decision_by),
    decisionOn: formatDate(row.decision_on),
    decisionComment: row.decision_comment,
  };
}

function mapCandidate(row: CandidateSqlRow): HiringCandidateListRow {
  return {
    id: row.id,
    number: row.candidate_number,
    requestId: row.hiring_request_id,
    requestNumber: row.request_number,
    requestLabel: row.request_label,
    jobTitle: row.job_title,
    requestStatus: row.request_status,
    positions: row.request_positions,
    seatsTaken: row.seats_taken,
    desiredStartDate: formatDate(row.desired_start_date),
    departmentId: row.department_id,
    branchId: row.branch_id,
    employmentTypeId: row.employment_type_id,
    employeeCategoryId: row.employee_category_id,
    firstName: row.first_name,
    middleName: text(row.middle_name),
    lastName: row.last_name,
    name: row.person_name,
    email: text(row.email),
    phone: text(row.phone),
    source: text(row.source),
    cvFileName: row.cv_file_name,
    notes: row.notes,
    addedOn: formatDate(row.added_on),
    status: row.status,
    startDate: formatDate(row.start_date),
    employeeId: row.employee_id,
    employeeCode: text(row.employee_code),
  };
}

function requestFilter(query: Pick<HiringListQuery, "status" | "search">) {
  return {
    status: requestStatus(query.status),
    search: `%${query.search.trim()}%`,
  };
}

function candidateFilter(query: Pick<HiringListQuery, "status" | "search">) {
  return {
    status: candidateStatus(query.status),
    search: `%${query.search.trim()}%`,
  };
}

const REQUEST_WHERE = `
  WHERE r.company_id = @companyId
    AND (@status = N'' OR r.status = @status)
    AND (
      @search = N'%%'
      OR (${REQUEST_NUMBER}) LIKE @search
      OR r.job_title LIKE @search
      OR d.name LIKE @search
      OR ISNULL(b.name, N'') LIKE @search
      OR r.requested_by LIKE @search
    )
`;

const CANDIDATE_WHERE = `
  WHERE c.company_id = @companyId
    AND c.status <> N'Converted'
    AND (@status = N'' OR c.status = @status)
    AND (
      @search = N'%%'
      OR (${CANDIDATE_NUMBER}) LIKE @search
      OR ${PERSON_NAME} LIKE @search
      OR ISNULL(c.email, N'') LIKE @search
      OR ISNULL(c.phone, N'') LIKE @search
      OR (${REQUEST_LABEL}) LIKE @search
      OR ISNULL(c.source, N'') LIKE @search
    )
`;

export async function listHiringRequests(query: HiringListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as HiringRequestListRow[], totalCount: 0 };
  }
  const filter = requestFilter(query);
  const size = pageSizeOf(query.pageSize);
  const page = Math.max(1, query.page || 1);
  const pool = await getPool();
  const count = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(30), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
    `);
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(30), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .input("offset", sql.Int, (page - 1) * size)
    .input("pageSize", sql.Int, size)
    .query<RequestSqlRow>(`
      SELECT ${REQUEST_COLUMNS}
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
      ORDER BY ${requestOrder(query.sortKey, query.sortDirection)}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return {
    rows: result.recordset.map(mapRequest),
    totalCount: count.recordset[0]?.total ?? 0,
  };
}

export async function listHiringRequestsForExport(query: Omit<HiringListQuery, "page" | "pageSize">) {
  const session = await requireCompany();
  if ("error" in session) {
    return [] as HiringRequestListRow[];
  }
  const filter = requestFilter(query);
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(30), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .query<RequestSqlRow>(`
      SELECT ${REQUEST_COLUMNS}
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
      ORDER BY ${requestOrder(query.sortKey, query.sortDirection)}
    `);
  return result.recordset.map(mapRequest);
}

export async function listHiringCandidates(query: HiringListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as HiringCandidateListRow[], totalCount: 0 };
  }
  const filter = candidateFilter(query);
  const size = pageSizeOf(query.pageSize);
  const page = Math.max(1, query.page || 1);
  const pool = await getPool();
  const count = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(20), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${CANDIDATE_FROM}
      ${CANDIDATE_WHERE}
    `);
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(20), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .input("offset", sql.Int, (page - 1) * size)
    .input("pageSize", sql.Int, size)
    .query<CandidateSqlRow>(`
      SELECT ${CANDIDATE_COLUMNS}
      ${CANDIDATE_FROM}
      ${CANDIDATE_WHERE}
      ORDER BY ${candidateOrder(query.sortKey, query.sortDirection)}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return {
    rows: result.recordset.map(mapCandidate),
    totalCount: count.recordset[0]?.total ?? 0,
  };
}

export async function listHiringCandidatesForExport(query: Omit<HiringListQuery, "page" | "pageSize">) {
  const session = await requireCompany();
  if ("error" in session) {
    return [] as HiringCandidateListRow[];
  }
  const filter = candidateFilter(query);
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(20), filter.status)
    .input("search", sql.NVarChar(400), filter.search)
    .query<CandidateSqlRow>(`
      SELECT ${CANDIDATE_COLUMNS}
      ${CANDIDATE_FROM}
      ${CANDIDATE_WHERE}
      ORDER BY ${candidateOrder(query.sortKey, query.sortDirection)}
    `);
  return result.recordset.map(mapCandidate);
}

export async function listHiringFormOptions(): Promise<HiringFormOptions> {
  const session = await requireCompany();
  const empty: HiringFormOptions = {
    departments: [],
    branches: [],
    employmentTypes: [],
    employeeCategories: [],
    approvedRequests: [],
    nextEmployeeCode: "EMP001",
  };
  if ("error" in session) {
    return empty;
  }
  const [lookups, nextEmployeeCode, requests] = await Promise.all([
    listEmployeeFormOptions(),
    peekNextEmployeeCode(),
    listApprovedRequestOptions(session.company.id),
  ]);
  return {
    ...lookups,
    approvedRequests: requests,
    nextEmployeeCode,
  };
}

async function listApprovedRequestOptions(companyId: number) {
  const pool = await getPool();
  const result = await pool.request().input("companyId", sql.Int, companyId).query<{
    id: number;
    label: string;
  }>(`
    SELECT r.id, ${REQUEST_LABEL} AS label
    ${REQUEST_FROM}
    WHERE r.company_id = @companyId
      AND r.status = N'Approved'
    ORDER BY r.id DESC
  `);
  return result.recordset;
}

export async function getHiringRequest(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return null;
  }
  const pool = await getPool();
  const request = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query<RequestSqlRow>(`
      SELECT ${REQUEST_COLUMNS}
      ${REQUEST_FROM}
      WHERE r.company_id = @companyId AND r.id = @id
    `);
  const row = request.recordset[0];
  if (!row) {
    return null;
  }
  const candidates = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query<CandidateSqlRow>(`
      SELECT ${CANDIDATE_COLUMNS}
      ${CANDIDATE_FROM}
      WHERE c.company_id = @companyId AND c.hiring_request_id = @id
      ORDER BY c.id ASC
    `);
  return {
    request: mapRequest(row),
    candidates: candidates.recordset.map(mapCandidate),
  };
}

function validateRequest(input: HiringRequestSaveInput) {
  const jobTitle = input.jobTitle.trim();
  if (!jobTitle) {
    return { error: "Job title is required." };
  }
  if (jobTitle.length > 200) {
    return { error: "Job title must be 200 characters or fewer." };
  }
  if (!input.departmentId) {
    return { error: "Department is required." };
  }
  if (input.positions === null || !Number.isInteger(input.positions) || input.positions < 1) {
    return { error: "Positions must be at least 1." };
  }
  if (!(HIRING_REQUEST_REASONS as readonly string[]).includes(input.reason)) {
    return { error: "Reason is required." };
  }
  const justification = input.justification.trim();
  if (!justification) {
    return { error: "Justification is required." };
  }
  if (justification.length > 1000) {
    return { error: "Justification must be 1000 characters or fewer." };
  }
  const requestedBy = input.requestedBy.trim();
  if (!requestedBy) {
    return { error: "Requested by is required." };
  }
  if (requestedBy.length > 200) {
    return { error: "Requested by must be 200 characters or fewer." };
  }
  const desiredStartDate = parseOptionalDate(input.desiredStartDate, "Desired start date");
  if (!desiredStartDate.ok) {
    return { error: desiredStartDate.error };
  }
  return {
    jobTitle,
    departmentId: input.departmentId,
    branchId: input.branchId,
    employmentTypeId: input.employmentTypeId,
    employeeCategoryId: input.employeeCategoryId,
    positions: input.positions,
    reason: input.reason as HiringRequestReason,
    justification,
    desiredStartDate: desiredStartDate.value,
    requestedBy,
  };
}

async function lookupsExist(
  runner: sql.Transaction,
  companyId: number,
  input: {
    departmentId: number;
    branchId: number | null;
    employmentTypeId: number | null;
    employeeCategoryId: number | null;
  },
) {
  const result = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("departmentId", sql.Int, input.departmentId)
    .input("branchId", sql.Int, input.branchId)
    .input("employmentTypeId", sql.Int, input.employmentTypeId)
    .input("employeeCategoryId", sql.Int, input.employeeCategoryId)
    .query<{
      department_ok: number;
      branch_ok: number;
      employment_type_ok: number;
      employee_category_ok: number;
    }>(`
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.departments WHERE id = @departmentId AND company_id = @companyId
        ) THEN 1 ELSE 0 END AS department_ok,
        CASE
          WHEN @branchId IS NULL THEN 1
          WHEN EXISTS (SELECT 1 FROM dbo.branches WHERE id = @branchId AND company_id = @companyId) THEN 1
          ELSE 0
        END AS branch_ok,
        CASE
          WHEN @employmentTypeId IS NULL THEN 1
          WHEN EXISTS (
            SELECT 1 FROM dbo.employment_types WHERE id = @employmentTypeId AND company_id = @companyId
          ) THEN 1
          ELSE 0
        END AS employment_type_ok,
        CASE
          WHEN @employeeCategoryId IS NULL THEN 1
          WHEN EXISTS (
            SELECT 1 FROM dbo.employee_categories WHERE id = @employeeCategoryId AND company_id = @companyId
          ) THEN 1
          ELSE 0
        END AS employee_category_ok
    `);
  const row = result.recordset[0];
  if (!row?.department_ok) {
    return { error: "Department not found." };
  }
  if (!row.branch_ok) {
    return { error: "Branch not found." };
  }
  if (!row.employment_type_ok) {
    return { error: "Employment type not found." };
  }
  if (!row.employee_category_ok) {
    return { error: "Employee category not found." };
  }
  return { ok: true as const };
}

function bindRequest(request: sql.Request, companyId: number, input: ReturnType<typeof validateRequest> & object) {
  if ("error" in input) {
    return request;
  }
  return request
    .input("companyId", sql.Int, companyId)
    .input("jobTitle", sql.NVarChar(200), input.jobTitle)
    .input("departmentId", sql.Int, input.departmentId)
    .input("branchId", sql.Int, input.branchId)
    .input("employmentTypeId", sql.Int, input.employmentTypeId)
    .input("employeeCategoryId", sql.Int, input.employeeCategoryId)
    .input("positions", sql.Int, input.positions)
    .input("reason", sql.NVarChar(20), input.reason)
    .input("justification", sql.NVarChar(1000), input.justification)
    .input("desiredStartDate", sql.Date, input.desiredStartDate)
    .input("requestedBy", sql.NVarChar(200), input.requestedBy);
}

export async function createHiringRequest(input: HiringRequestSaveInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateRequest(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await lookupsExist(transaction, session.company.id, parsed);
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    const result = await bindRequest(new sql.Request(transaction), session.company.id, parsed)
      .input("requestedOn", sql.Date, todayIso())
      .query<{ id: number }>(`
        INSERT INTO dbo.hiring_requests (
          company_id, job_title, department_id, branch_id, employment_type_id, employee_category_id,
          positions, reason, justification, desired_start_date, requested_by, requested_on, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @jobTitle, @departmentId, @branchId, @employmentTypeId, @employeeCategoryId,
          @positions, @reason, @justification, @desiredStartDate, @requestedBy, @requestedOn, N'Pending approval'
        )
      `);
    await transaction.commit();
    return { id: result.recordset[0].id };
  } catch (error) {
    await transaction.rollback();
    if (isForeignKeyError(error)) {
      return { error: "Department, branch, employment type or employee category was not found." };
    }
    throw error;
  }
}

export async function updateHiringRequest(id: number, input: HiringRequestSaveInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateRequest(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, id)
      .query<{ status: string; seats: number }>(`
        SELECT r.status, ${SEAT_COUNT} AS seats
        FROM dbo.hiring_requests AS r WITH (UPDLOCK, HOLDLOCK)
        WHERE r.company_id = @companyId AND r.id = @id
      `);
    const row = current.recordset[0];
    if (!row) {
      await transaction.rollback();
      return { error: "Hiring request not found." };
    }
    if (row.status !== "Pending approval") {
      await transaction.rollback();
      return { error: "Only a pending hiring request can be edited." };
    }
    if (parsed.positions < row.seats) {
      await transaction.rollback();
      return { error: `Positions cannot be less than the ${row.seats} already selected.` };
    }
    const lookup = await lookupsExist(transaction, session.company.id, parsed);
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    await bindRequest(new sql.Request(transaction), session.company.id, parsed)
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.hiring_requests
        SET job_title = @jobTitle,
            department_id = @departmentId,
            branch_id = @branchId,
            employment_type_id = @employmentTypeId,
            employee_category_id = @employeeCategoryId,
            positions = @positions,
            reason = @reason,
            justification = @justification,
            desired_start_date = @desiredStartDate,
            requested_by = @requestedBy
        WHERE company_id = @companyId AND id = @id AND status = N'Pending approval'
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isForeignKeyError(error)) {
      return { error: "Department, branch, employment type or employee category was not found." };
    }
    throw error;
  }
}

export async function decideHiringRequest(
  id: number,
  decision: "Approved" | "Rejected",
  decisionBy: string,
  decisionComment: string,
) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const approver = decisionBy.trim();
  if (!approver) {
    return { error: "Enter the approver's name." };
  }
  if (approver.length > 200) {
    return { error: "Approver name must be 200 characters or fewer." };
  }
  const comment = decisionComment.trim();
  if (decision === "Rejected" && !comment) {
    return { error: "Add a comment explaining the rejection." };
  }
  if (comment.length > 1000) {
    return { error: "Comment must be 1000 characters or fewer." };
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .input("status", sql.NVarChar(30), decision)
    .input("decisionBy", sql.NVarChar(200), approver)
    .input("decisionComment", sql.NVarChar(1000), comment)
    .input("decisionOn", sql.Date, todayIso())
    .query(`
      UPDATE dbo.hiring_requests
      SET status = @status,
          decision_by = @decisionBy,
          decision_comment = @decisionComment,
          decision_on = @decisionOn
      WHERE company_id = @companyId
        AND id = @id
        AND status = N'Pending approval'
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Only a pending hiring request can be approved or rejected." };
  }
  return { id };
}

export async function cancelHiringRequest(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query(`
      UPDATE dbo.hiring_requests
      SET status = N'Cancelled'
      WHERE company_id = @companyId
        AND id = @id
        AND status IN (N'Pending approval', N'Approved')
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Only a pending or approved hiring request can be cancelled." };
  }
  return { id };
}

function validateCandidate(input: HiringCandidateSaveInput) {
  if (!input.requestId) {
    return { error: "Approved request is required." };
  }
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) {
    return { error: "First name is required." };
  }
  if (firstName.length > 100) {
    return { error: "First name must be 100 characters or fewer." };
  }
  if (!lastName) {
    return { error: "Last name is required." };
  }
  if (lastName.length > 100) {
    return { error: "Last name must be 100 characters or fewer." };
  }
  const middleName = blankToNull(input.middleName);
  if (middleName && middleName.length > 100) {
    return { error: "Middle name must be 100 characters or fewer." };
  }
  const email = blankToNull(input.email);
  if (email && email.length > 256) {
    return { error: "Email must be 256 characters or fewer." };
  }
  const phone = blankToNull(input.phone);
  if (phone && phone.length > 50) {
    return { error: "Phone must be 50 characters or fewer." };
  }
  const source = blankToNull(input.source);
  if (source && !(CANDIDATE_SOURCES as readonly string[]).includes(source)) {
    return { error: "Source is not valid." };
  }
  const cvFileName = input.cvFileName.trim();
  if (cvFileName.length > 260) {
    return { error: "CV file name must be 260 characters or fewer." };
  }
  const notes = input.notes.trim();
  if (notes.length > 1000) {
    return { error: "Notes must be 1000 characters or fewer." };
  }
  return {
    requestId: input.requestId,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    source,
    cvFileName,
    notes,
  };
}

export async function createHiringCandidate(input: HiringCandidateSaveInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateCandidate(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, parsed.requestId)
      .query<{ status: string }>(`
        SELECT status
        FROM dbo.hiring_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId AND id = @id
      `);
    const row = request.recordset[0];
    if (!row) {
      await transaction.rollback();
      return { error: "Hiring request not found." };
    }
    if (row.status !== "Approved") {
      await transaction.rollback();
      return { error: "A candidate can only be added to an approved request." };
    }
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("requestId", sql.Int, parsed.requestId)
      .input("firstName", sql.NVarChar(100), parsed.firstName)
      .input("middleName", sql.NVarChar(100), parsed.middleName)
      .input("lastName", sql.NVarChar(100), parsed.lastName)
      .input("email", sql.NVarChar(256), parsed.email)
      .input("phone", sql.NVarChar(50), parsed.phone)
      .input("source", sql.NVarChar(20), parsed.source)
      .input("cvFileName", sql.NVarChar(260), parsed.cvFileName)
      .input("notes", sql.NVarChar(1000), parsed.notes)
      .input("addedOn", sql.Date, todayIso())
      .query<{ id: number }>(`
        INSERT INTO dbo.hiring_candidates (
          company_id, hiring_request_id, first_name, middle_name, last_name, email, phone,
          source, cv_file_name, notes, added_on, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @requestId, @firstName, @middleName, @lastName, @email, @phone,
          @source, @cvFileName, @notes, @addedOn, N'Shortlisted'
        )
      `);
    await transaction.commit();
    return { id: inserted.recordset[0].id };
  } catch (error) {
    await transaction.rollback();
    if (isForeignKeyError(error)) {
      return { error: "Hiring request not found." };
    }
    throw error;
  }
}

export async function updateHiringCandidate(id: number, input: HiringCandidateSaveInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateCandidate(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const current = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query<{ status: string; hiring_request_id: number }>(`
      SELECT status, hiring_request_id
      FROM dbo.hiring_candidates
      WHERE company_id = @companyId AND id = @id
    `);
  const row = current.recordset[0];
  if (!row) {
    return { error: "Candidate not found." };
  }
  if (row.status === "Converted") {
    return { error: "A converted candidate cannot be edited." };
  }
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .input("firstName", sql.NVarChar(100), parsed.firstName)
    .input("middleName", sql.NVarChar(100), parsed.middleName)
    .input("lastName", sql.NVarChar(100), parsed.lastName)
    .input("email", sql.NVarChar(256), parsed.email)
    .input("phone", sql.NVarChar(50), parsed.phone)
    .input("source", sql.NVarChar(20), parsed.source)
    .input("cvFileName", sql.NVarChar(260), parsed.cvFileName)
    .input("notes", sql.NVarChar(1000), parsed.notes)
    .query(`
      UPDATE dbo.hiring_candidates
      SET first_name = @firstName,
          middle_name = @middleName,
          last_name = @lastName,
          email = @email,
          phone = @phone,
          source = @source,
          cv_file_name = @cvFileName,
          notes = @notes
      WHERE company_id = @companyId AND id = @id AND status <> N'Converted'
    `);
  if (!result.rowsAffected[0]) {
    return { error: "A converted candidate cannot be edited." };
  }
  return { id };
}

export async function selectHiringCandidate(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, id)
      .query<{ status: string; hiring_request_id: number }>(`
        SELECT c.status, c.hiring_request_id
        FROM dbo.hiring_candidates AS c WITH (UPDLOCK, HOLDLOCK)
        WHERE c.company_id = @companyId AND c.id = @id
      `);
    const candidate = current.recordset[0];
    if (!candidate) {
      await transaction.rollback();
      return { error: "Candidate not found." };
    }
    if (candidate.status !== "Shortlisted") {
      await transaction.rollback();
      return { error: "Only a shortlisted candidate can be selected." };
    }
    const request = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, candidate.hiring_request_id)
      .query<{ status: string; positions: number; seats: number }>(`
        SELECT r.status, r.positions, ${SEAT_COUNT} AS seats
        FROM dbo.hiring_requests AS r WITH (UPDLOCK, HOLDLOCK)
        WHERE r.company_id = @companyId AND r.id = @id
      `);
    const row = request.recordset[0];
    if (!row || row.status !== "Approved") {
      await transaction.rollback();
      return { error: "Candidates can be selected only on an approved request." };
    }
    if (row.seats >= row.positions) {
      await transaction.rollback();
      return { error: "All positions already have a candidate." };
    }
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.hiring_candidates
        SET status = N'Selected'
        WHERE company_id = @companyId AND id = @id AND status = N'Shortlisted'
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function unselectHiringCandidate(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query(`
      UPDATE dbo.hiring_candidates
      SET status = N'Shortlisted'
      WHERE company_id = @companyId AND id = @id AND status = N'Selected'
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Only a selected candidate can be moved back to the shortlist." };
  }
  return { id };
}

export async function rejectHiringCandidate(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("id", sql.Int, id)
    .query(`
      UPDATE dbo.hiring_candidates
      SET status = N'Not selected'
      WHERE company_id = @companyId
        AND id = @id
        AND status IN (N'Shortlisted', N'Selected')
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Only a shortlisted or selected candidate can be marked not selected." };
  }
  return { id };
}

export async function confirmHiringCandidate(id: number, startDate: string) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsedDate = parseOptionalDate(startDate, "Start date");
  if (!parsedDate.ok) {
    return { error: parsedDate.error };
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, id)
      .query<{ status: string; hiring_request_id: number }>(`
        SELECT status, hiring_request_id
        FROM dbo.hiring_candidates WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId AND id = @id
      `);
    const candidate = current.recordset[0];
    if (!candidate || candidate.status !== "Selected") {
      await transaction.rollback();
      return { error: "Only a selected candidate can be confirmed." };
    }
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, id)
      .input("startDate", sql.Date, parsedDate.value)
      .query(`
        UPDATE dbo.hiring_candidates
        SET status = N'Hire confirmed',
            start_date = @startDate
        WHERE company_id = @companyId AND id = @id AND status = N'Selected'
      `);
    const request = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, candidate.hiring_request_id)
      .query<{ positions: number; confirmed: number }>(`
        SELECT r.positions,
          (
            SELECT COUNT(*)
            FROM dbo.hiring_candidates AS confirmed
            WHERE confirmed.hiring_request_id = r.id
              AND confirmed.company_id = r.company_id
              AND confirmed.status IN (N'Hire confirmed', N'Converted')
          ) AS confirmed
        FROM dbo.hiring_requests AS r
        WHERE r.company_id = @companyId AND r.id = @id
      `);
    const row = request.recordset[0];
    if (row && row.confirmed >= row.positions) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("requestId", sql.Int, candidate.hiring_request_id)
        .query(`
          UPDATE dbo.hiring_candidates
          SET status = N'Not selected'
          WHERE company_id = @companyId
            AND hiring_request_id = @requestId
            AND status = N'Shortlisted'
        `);
    }
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function markHiringCandidateConverted(candidateId: number, employeeId: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const employee = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, employeeId)
      .query<{ employee_code: string }>(`
        SELECT employee_code
        FROM dbo.employees
        WHERE company_id = @companyId AND id = @employeeId
      `);
    if (!employee.recordset[0]) {
      await transaction.rollback();
      return { error: "Employee not found." };
    }
    const current = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, candidateId)
      .query<{ status: string; hiring_request_id: number }>(`
        SELECT status, hiring_request_id
        FROM dbo.hiring_candidates WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId AND id = @id
      `);
    const candidate = current.recordset[0];
    if (!candidate || candidate.status !== "Hire confirmed") {
      await transaction.rollback();
      return { error: "Only a confirmed hire can be converted to an employee." };
    }
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, candidateId)
      .input("employeeId", sql.Int, employeeId)
      .query(`
        UPDATE dbo.hiring_candidates
        SET status = N'Converted',
            employee_id = @employeeId
        WHERE company_id = @companyId AND id = @id AND status = N'Hire confirmed'
      `);
    const request = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("id", sql.Int, candidate.hiring_request_id)
      .query<{ status: string; positions: number; converted: number }>(`
        SELECT r.status, r.positions,
          (
            SELECT COUNT(*)
            FROM dbo.hiring_candidates AS converted
            WHERE converted.hiring_request_id = r.id
              AND converted.company_id = r.company_id
              AND converted.status = N'Converted'
          ) AS converted
        FROM dbo.hiring_requests AS r
        WHERE r.company_id = @companyId AND r.id = @id
      `);
    const row = request.recordset[0];
    if (row && row.status === "Approved" && row.converted >= row.positions) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("id", sql.Int, candidate.hiring_request_id)
        .query(`
          UPDATE dbo.hiring_requests
          SET status = N'Filled'
          WHERE company_id = @companyId AND id = @id AND status = N'Approved'
        `);
    }
    await transaction.commit();
    return { id: candidateId, employeeCode: employee.recordset[0].employee_code };
  } catch (error) {
    await transaction.rollback();
    if (isForeignKeyError(error)) {
      return { error: "Employee not found." };
    }
    throw error;
  }
}
