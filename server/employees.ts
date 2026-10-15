import "server-only";
import { EMPLOYEE_STATUSES, type EmployeeImportRecord, type EmployeeInput, type EmployeeListRow, type EmployeeLookupOption } from "@/components/employees/employee.types";
import { getPool, sql } from "./db";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type EmployeeListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  employeeCode: "e.employee_code",
  firstName: "e.first_name",
  middleName: "e.middle_name",
  lastName: "e.last_name",
  designation: "e.designation",
  department: "d.name",
  email: "e.email",
  status: "e.status",
};

const EMPLOYEE_COLUMNS = `
  e.id,
  e.employee_code,
  e.first_name,
  e.middle_name,
  e.last_name,
  e.email,
  e.phone_number,
  e.date_of_birth,
  e.gender,
  e.id_number,
  e.passport_number,
  e.marital_status,
  e.emergency_contact_name,
  e.emergency_contact_phone,
  e.employment_type_id,
  t.name AS employment_type_name,
  e.employee_category_id,
  cat.name AS employee_category_name,
  e.designation,
  e.department_id,
  d.name AS department_name,
  e.branch_id,
  b.name AS branch_name,
  e.join_date,
  e.nssf_number,
  e.office_email,
  e.office_phone,
  e.status
`;

const EMPLOYEE_FROM = `
  FROM dbo.employees AS e
  LEFT JOIN dbo.branches AS b
    ON b.id = e.branch_id AND b.company_id = e.company_id
  LEFT JOIN dbo.departments AS d
    ON d.id = e.department_id AND d.company_id = e.company_id
  LEFT JOIN dbo.employment_types AS t
    ON t.id = e.employment_type_id AND t.company_id = e.company_id
  LEFT JOIN dbo.employee_categories AS cat
    ON cat.id = e.employee_category_id AND cat.company_id = e.company_id
`;

const EMPLOYEE_SEARCH = `
        AND (
          @search = N'%%'
          OR e.employee_code LIKE @search
          OR e.first_name LIKE @search
          OR ISNULL(e.middle_name, N'') LIKE @search
          OR e.last_name LIKE @search
          OR ISNULL(e.designation, N'') LIKE @search
          OR ISNULL(d.name, N'') LIKE @search
          OR ISNULL(e.email, N'') LIKE @search
          OR e.status LIKE @search
        )
`;

type EmployeeSqlRow = {
  id: number;
  employee_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  date_of_birth: Date | string | null;
  gender: string | null;
  id_number: string | null;
  passport_number: string | null;
  marital_status: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  employment_type_id: number | null;
  employment_type_name: string | null;
  employee_category_id: number | null;
  employee_category_name: string | null;
  designation: string | null;
  department_id: number | null;
  department_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  join_date: Date | string | null;
  nssf_number: string | null;
  office_email: string | null;
  office_phone: string | null;
  status: string;
};

function errorNumber(error: unknown) {
  return error && typeof error === "object" && "number" in error
    ? Number((error as { number: unknown }).number)
    : NaN;
}

function isUniqueError(error: unknown) {
  const number = errorNumber(error);
  return number === 2627 || number === 2601;
}

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

function text(value: string | null | undefined) {
  return value ?? "";
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDate(
  value: string,
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: `${label} must be in YYYY-MM-DD format.` };
  }
  return { ok: true, value: trimmed };
}

function mapEmployee(row: EmployeeSqlRow): EmployeeListRow {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    middleName: text(row.middle_name),
    lastName: row.last_name,
    email: text(row.email),
    phoneNumber: text(row.phone_number),
    dateOfBirth: formatDate(row.date_of_birth),
    gender: text(row.gender),
    idNumber: text(row.id_number),
    passportNumber: text(row.passport_number),
    maritalStatus: text(row.marital_status),
    emergencyContactName: text(row.emergency_contact_name),
    emergencyContactPhone: text(row.emergency_contact_phone),
    employmentTypeId: row.employment_type_id,
    employmentTypeName: text(row.employment_type_name),
    employeeCategoryId: row.employee_category_id,
    employeeCategoryName: text(row.employee_category_name),
    designation: text(row.designation),
    departmentId: row.department_id,
    departmentName: text(row.department_name),
    branchId: row.branch_id,
    branchName: text(row.branch_name),
    joinDate: formatDate(row.join_date),
    nssfNumber: text(row.nssf_number),
    officeEmail: text(row.office_email),
    officePhone: text(row.office_phone),
    status: row.status,
  };
}

function nextCode(existing: string[]) {
  let next = 0;
  const taken = new Set<string>();
  for (const code of existing) {
    taken.add(code.toUpperCase());
    const match = /^EMP(\d+)$/i.exec(code.trim());
    if (match) {
      next = Math.max(next, Number(match[1]));
    }
  }
  let code = "";
  do {
    next += 1;
    code = `EMP${String(next).padStart(3, "0")}`;
  } while (taken.has(code.toUpperCase()));
  return code;
}

async function allocateCode(transaction: sql.Transaction, companyId: number, reserved: string[]) {
  const result = await new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .query<{ employee_code: string }>(`
      SELECT employee_code
      FROM dbo.employees WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
    `);
  return nextCode([
    ...result.recordset.map((row) => row.employee_code),
    ...reserved,
  ]);
}

type ParsedEmployee = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  idNumber: string | null;
  passportNumber: string | null;
  maritalStatus: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  employmentTypeId: number | null;
  employeeCategoryId: number | null;
  designation: string | null;
  departmentId: number | null;
  branchId: number | null;
  joinDate: string | null;
  nssfNumber: string | null;
  officeEmail: string | null;
  officePhone: string | null;
  status: string;
};

function validateEmployee(input: EmployeeInput): ParsedEmployee | { error: string } {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) {
    return { error: "First name is required." };
  }
  if (!lastName) {
    return { error: "Last name is required." };
  }
  const status = input.status.trim() || "Active";
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(status)) {
    return { error: `status must be one of ${EMPLOYEE_STATUSES.join(", ")}.` };
  }
  const dateOfBirth = parseDate(input.dateOfBirth, "Date of birth");
  if (!dateOfBirth.ok) {
    return { error: dateOfBirth.error };
  }
  const joinDate = parseDate(input.joinDate, "join date");
  if (!joinDate.ok) {
    return { error: joinDate.error };
  }
  return {
    firstName,
    middleName: blankToNull(input.middleName),
    lastName,
    email: blankToNull(input.email),
    phoneNumber: blankToNull(input.phoneNumber),
    dateOfBirth: dateOfBirth.value,
    gender: blankToNull(input.gender),
    idNumber: blankToNull(input.idNumber),
    passportNumber: blankToNull(input.passportNumber),
    maritalStatus: blankToNull(input.maritalStatus),
    emergencyContactName: blankToNull(input.emergencyContactName),
    emergencyContactPhone: blankToNull(input.emergencyContactPhone),
    employmentTypeId: input.employmentTypeId,
    employeeCategoryId: input.employeeCategoryId,
    designation: blankToNull(input.designation),
    departmentId: input.departmentId,
    branchId: input.branchId,
    joinDate: joinDate.value,
    nssfNumber: blankToNull(input.nssfNumber),
    officeEmail: blankToNull(input.officeEmail),
    officePhone: blankToNull(input.officePhone),
    status,
  };
}

async function lookupBelongsToCompany(
  transaction: sql.Transaction,
  companyId: number,
  input: {
    branchId: number | null;
    departmentId: number | null;
    employmentTypeId: number | null;
    employeeCategoryId: number | null;
  },
) {
  const request = new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .input("branchId", sql.Int, input.branchId)
    .input("departmentId", sql.Int, input.departmentId)
    .input("employmentTypeId", sql.Int, input.employmentTypeId)
    .input("employeeCategoryId", sql.Int, input.employeeCategoryId);
  const result = await request.query<{
    branch_ok: number;
    department_ok: number;
    employment_type_ok: number;
    employee_category_ok: number;
  }>(`
    SELECT
      CASE
        WHEN @branchId IS NULL THEN 1
        WHEN EXISTS (
          SELECT 1 FROM dbo.branches
          WHERE id = @branchId AND company_id = @companyId
        ) THEN 1
        ELSE 0
      END AS branch_ok,
      CASE
        WHEN @departmentId IS NULL THEN 1
        WHEN EXISTS (
          SELECT 1 FROM dbo.departments
          WHERE id = @departmentId AND company_id = @companyId
        ) THEN 1
        ELSE 0
      END AS department_ok,
      CASE
        WHEN @employmentTypeId IS NULL THEN 1
        WHEN EXISTS (
          SELECT 1 FROM dbo.employment_types
          WHERE id = @employmentTypeId AND company_id = @companyId
        ) THEN 1
        ELSE 0
      END AS employment_type_ok,
      CASE
        WHEN @employeeCategoryId IS NULL THEN 1
        WHEN EXISTS (
          SELECT 1 FROM dbo.employee_categories
          WHERE id = @employeeCategoryId AND company_id = @companyId
        ) THEN 1
        ELSE 0
      END AS employee_category_ok
  `);
  const row = result.recordset[0];
  if (!row.branch_ok) {
    return { error: "Branch not found." };
  }
  if (!row.department_ok) {
    return { error: "Department not found." };
  }
  if (!row.employment_type_ok) {
    return { error: "Employment type not found." };
  }
  if (!row.employee_category_ok) {
    return { error: "Employee category not found." };
  }
  return {};
}

function bindEmployee(
  request: sql.Request,
  companyId: number,
  actorId: number,
  employeeCode: string | null,
  input: ParsedEmployee,
) {
  request
    .input("companyId", sql.Int, companyId)
    .input("actorId", sql.Int, actorId)
    .input("firstName", sql.NVarChar(100), input.firstName)
    .input("middleName", sql.NVarChar(100), input.middleName)
    .input("lastName", sql.NVarChar(100), input.lastName)
    .input("email", sql.NVarChar(256), input.email)
    .input("phoneNumber", sql.NVarChar(50), input.phoneNumber)
    .input("dateOfBirth", sql.Date, input.dateOfBirth)
    .input("gender", sql.NVarChar(50), input.gender)
    .input("idNumber", sql.NVarChar(50), input.idNumber)
    .input("passportNumber", sql.NVarChar(50), input.passportNumber)
    .input("maritalStatus", sql.NVarChar(50), input.maritalStatus)
    .input("emergencyContactName", sql.NVarChar(200), input.emergencyContactName)
    .input("emergencyContactPhone", sql.NVarChar(50), input.emergencyContactPhone)
    .input("employmentTypeId", sql.Int, input.employmentTypeId)
    .input("employeeCategoryId", sql.Int, input.employeeCategoryId)
    .input("designation", sql.NVarChar(200), input.designation)
    .input("departmentId", sql.Int, input.departmentId)
    .input("branchId", sql.Int, input.branchId)
    .input("joinDate", sql.Date, input.joinDate)
    .input("nssfNumber", sql.NVarChar(50), input.nssfNumber)
    .input("officeEmail", sql.NVarChar(256), input.officeEmail)
    .input("officePhone", sql.NVarChar(50), input.officePhone)
    .input("status", sql.NVarChar(20), input.status);
  if (employeeCode) {
    request.input("employeeCode", sql.NVarChar(20), employeeCode);
  }
  return request;
}

const INSERT_EMPLOYEE = `
  INSERT INTO dbo.employees (
    company_id, employee_code, first_name, middle_name, last_name, email, phone_number,
    date_of_birth, gender, id_number, passport_number, marital_status,
    emergency_contact_name, emergency_contact_phone, employment_type_id, employee_category_id,
    designation, department_id, branch_id, join_date, nssf_number, office_email, office_phone,
    status, created_by, updated_by
  )
  OUTPUT INSERTED.id
  VALUES (
    @companyId, @employeeCode, @firstName, @middleName, @lastName, @email, @phoneNumber,
    @dateOfBirth, @gender, @idNumber, @passportNumber, @maritalStatus,
    @emergencyContactName, @emergencyContactPhone, @employmentTypeId, @employeeCategoryId,
    @designation, @departmentId, @branchId, @joinDate, @nssfNumber, @officeEmail, @officePhone,
    @status, @actorId, @actorId
  )
`;

export async function listEmployeeFormOptions() {
  const empty = {
    branches: [] as EmployeeLookupOption[],
    departments: [] as EmployeeLookupOption[],
    employmentTypes: [] as EmployeeLookupOption[],
    employeeCategories: [] as EmployeeLookupOption[],
  };
  const session = await requireCompany();
  if ("error" in session) {
    return empty;
  }

  const pool = await getPool();
  const companyId = session.company.id;
  const [branches, departments, employmentTypes, employeeCategories] = await Promise.all([
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT b.id, b.name
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId AND b.is_active = 1
      ORDER BY b.name
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT d.id, d.name
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId AND d.is_active = 1
      ORDER BY d.name
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT t.id, t.name
      FROM dbo.employment_types AS t
      WHERE t.company_id = @companyId
      ORDER BY t.name
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT c.id, c.name
      FROM dbo.employee_categories AS c
      WHERE c.company_id = @companyId
      ORDER BY c.name
    `),
  ]);

  return {
    branches: branches.recordset,
    departments: departments.recordset,
    employmentTypes: employmentTypes.recordset,
    employeeCategories: employeeCategories.recordset,
  };
}

export async function peekNextEmployeeCode() {
  const session = await requireCompany();
  if ("error" in session) {
    return "EMP001";
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .query<{ employee_code: string }>(`
      SELECT employee_code
      FROM dbo.employees
      WHERE company_id = @companyId
    `);
  return nextCode(result.recordset.map((row) => row.employee_code));
}

export async function listEmployees(query: EmployeeListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0 };
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.employeeCode;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const offset = (query.page - 1) * query.pageSize;
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${EMPLOYEE_FROM}
      WHERE e.company_id = @companyId
      ${EMPLOYEE_SEARCH}
    `);
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<EmployeeSqlRow>(`
      SELECT ${EMPLOYEE_COLUMNS}
      ${EMPLOYEE_FROM}
      WHERE e.company_id = @companyId
      ${EMPLOYEE_SEARCH}
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapEmployee),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listEmployeesForExport(
  query: Omit<EmployeeListQuery, "page" | "pageSize">,
) {
  const session = await requireCompany();
  if ("error" in session) {
    return [];
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.employeeCode;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<EmployeeSqlRow>(`
      SELECT ${EMPLOYEE_COLUMNS}
      ${EMPLOYEE_FROM}
      WHERE e.company_id = @companyId
      ${EMPLOYEE_SEARCH}
      ORDER BY ${sortColumn} ${direction}
    `);
  return listResult.recordset.map(mapEmployee);
}

export async function createEmployee(input: EmployeeInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateEmployee(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await lookupBelongsToCompany(transaction, session.company.id, parsed);
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    const employeeCode = await allocateCode(transaction, session.company.id, []);
    const result = await bindEmployee(
      new sql.Request(transaction),
      session.company.id,
      session.user.id,
      employeeCode,
      parsed,
    ).query<{ id: number }>(INSERT_EMPLOYEE);
    await transaction.commit();
    return { id: result.recordset[0].id, employeeCode };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: "An employee with this code already exists." };
    }
    throw error;
  }
}

export async function updateEmployee(id: number, input: EmployeeInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateEmployee(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await lookupBelongsToCompany(transaction, session.company.id, parsed);
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    const result = await bindEmployee(
      new sql.Request(transaction),
      session.company.id,
      session.user.id,
      null,
      parsed,
    )
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.employees
        SET
          first_name = @firstName,
          middle_name = @middleName,
          last_name = @lastName,
          email = @email,
          phone_number = @phoneNumber,
          date_of_birth = @dateOfBirth,
          gender = @gender,
          id_number = @idNumber,
          passport_number = @passportNumber,
          marital_status = @maritalStatus,
          emergency_contact_name = @emergencyContactName,
          emergency_contact_phone = @emergencyContactPhone,
          employment_type_id = @employmentTypeId,
          employee_category_id = @employeeCategoryId,
          designation = @designation,
          department_id = @departmentId,
          branch_id = @branchId,
          join_date = @joinDate,
          nssf_number = @nssfNumber,
          office_email = @officeEmail,
          office_phone = @officePhone,
          status = @status,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);
    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Employee not found." };
    }
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteEmployee(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.employees
      WHERE id = @id
        AND company_id = @companyId
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Employee not found." };
  }
  return { id };
}

function nameMap(rows: { id: number; name: string }[]) {
  return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row.id]));
}

export async function importEmployees(records: EmployeeImportRecord[], dryRun: boolean) {
  const session = await requireCompany();
  if ("error" in session) {
    return { problems: [session.error] };
  }

  const pool = await getPool();
  const companyId = session.company.id;
  const [branches, departments, employmentTypes, employeeCategories] = await Promise.all([
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT id, name FROM dbo.branches WHERE company_id = @companyId
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT id, name FROM dbo.departments WHERE company_id = @companyId
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT id, name FROM dbo.employment_types WHERE company_id = @companyId
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{ id: number; name: string }>(`
      SELECT id, name FROM dbo.employee_categories WHERE company_id = @companyId
    `),
  ]);
  const lookups = [
    { field: "branch" as const, label: "branch", names: nameMap(branches.recordset) },
    { field: "department" as const, label: "department", names: nameMap(departments.recordset) },
    { field: "employmentType" as const, label: "employment type", names: nameMap(employmentTypes.recordset) },
    { field: "employeeCategory" as const, label: "employee category", names: nameMap(employeeCategories.recordset) },
  ];

  const problems: string[] = [];
  const rows: ParsedEmployee[] = [];

  records.forEach((record, index) => {
    const rowLabel = `Row ${index + 2}`;
    const ids: Record<(typeof lookups)[number]["field"], number | null> = {
      branch: null,
      department: null,
      employmentType: null,
      employeeCategory: null,
    };
    for (const lookup of lookups) {
      const value = record[lookup.field].trim();
      if (!value) {
        continue;
      }
      const id = lookup.names.get(value.toLowerCase());
      if (!id) {
        problems.push(`${rowLabel}: ${lookup.label} "${value}" does not exist. Add it first.`);
      } else {
        ids[lookup.field] = id;
      }
    }
    const parsed = validateEmployee({
      firstName: record.firstName,
      middleName: record.middleName,
      lastName: record.lastName,
      email: record.email,
      phoneNumber: record.phoneNumber,
      dateOfBirth: "",
      gender: "",
      idNumber: "",
      passportNumber: "",
      maritalStatus: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      employmentTypeId: ids.employmentType,
      employeeCategoryId: ids.employeeCategory,
      designation: record.designation,
      departmentId: ids.department,
      branchId: ids.branch,
      joinDate: record.joinDate,
      nssfNumber: "",
      officeEmail: "",
      officePhone: "",
      status: record.status,
    });
    if ("error" in parsed) {
      problems.push(`${rowLabel}: ${parsed.error}`);
      return;
    }
    rows.push(parsed);
  });

  if (problems.length > 0 || dryRun) {
    return { problems };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const reserved: string[] = [];
    for (const row of rows) {
      const employeeCode = await allocateCode(transaction, companyId, reserved);
      reserved.push(employeeCode);
      await bindEmployee(
        new sql.Request(transaction),
        companyId,
        session.user.id,
        employeeCode,
        row,
      ).query(INSERT_EMPLOYEE);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { problems: ["An employee with this code already exists."] };
    }
    throw error;
  }

  return { problems: [] };
}
