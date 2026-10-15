-- 0012: company-scoped hiring requests and candidates.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0012_hiring.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.
-- Requires departments, branches, employment types, categories and employees.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0012')
BEGIN
    PRINT N'0012_hiring already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.hiring_requests (
    id                     INT IDENTITY(1,1) NOT NULL,
    company_id             INT               NOT NULL,
    job_title              NVARCHAR(200)     NOT NULL,
    department_id          INT               NOT NULL,
    branch_id              INT               NULL,
    employment_type_id     INT               NULL,
    employee_category_id   INT               NULL,
    positions              INT               NOT NULL,
    reason                 NVARCHAR(20)      NOT NULL,
    justification          NVARCHAR(1000)    NOT NULL,
    desired_start_date     DATE              NULL,
    requested_by           NVARCHAR(200)     NOT NULL,
    requested_on           DATE              NOT NULL,
    status                 NVARCHAR(30)      NOT NULL,
    decision_by            NVARCHAR(200)     NULL,
    decision_on            DATE              NULL,
    decision_comment       NVARCHAR(1000)    NOT NULL CONSTRAINT df_hiring_requests_decision_comment DEFAULT (N''),
    CONSTRAINT pk_hiring_requests PRIMARY KEY (id),
    CONSTRAINT uq_hiring_requests_id_company UNIQUE (id, company_id),
    CONSTRAINT ck_hiring_requests_job_title CHECK (LEN(job_title) > 0),
    CONSTRAINT ck_hiring_requests_positions CHECK (positions >= 1),
    CONSTRAINT ck_hiring_requests_reason CHECK (reason IN (N'New position', N'Replacement')),
    CONSTRAINT ck_hiring_requests_justification CHECK (LEN(justification) > 0),
    CONSTRAINT ck_hiring_requests_requested_by CHECK (LEN(requested_by) > 0),
    CONSTRAINT ck_hiring_requests_status CHECK (status IN (N'Pending approval', N'Approved', N'Rejected', N'Filled', N'Cancelled')),
    CONSTRAINT fk_hiring_requests_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_hiring_requests_department FOREIGN KEY (department_id, company_id) REFERENCES dbo.departments (id, company_id),
    CONSTRAINT fk_hiring_requests_branch FOREIGN KEY (branch_id, company_id) REFERENCES dbo.branches (id, company_id),
    CONSTRAINT fk_hiring_requests_employment_type FOREIGN KEY (employment_type_id, company_id) REFERENCES dbo.employment_types (id, company_id),
    CONSTRAINT fk_hiring_requests_employee_category FOREIGN KEY (employee_category_id, company_id) REFERENCES dbo.employee_categories (id, company_id)
);

CREATE INDEX ix_hiring_requests_company_id ON dbo.hiring_requests (company_id);
GO

CREATE TABLE dbo.hiring_candidates (
    id                 INT IDENTITY(1,1) NOT NULL,
    company_id         INT               NOT NULL,
    hiring_request_id  INT               NOT NULL,
    first_name         NVARCHAR(100)     NOT NULL,
    middle_name        NVARCHAR(100)     NULL,
    last_name          NVARCHAR(100)     NOT NULL,
    email              NVARCHAR(256)     NULL,
    phone              NVARCHAR(50)      NULL,
    source             NVARCHAR(20)      NULL,
    cv_file_name       NVARCHAR(260)     NOT NULL CONSTRAINT df_hiring_candidates_cv_file_name DEFAULT (N''),
    notes              NVARCHAR(1000)    NOT NULL CONSTRAINT df_hiring_candidates_notes DEFAULT (N''),
    added_on           DATE              NOT NULL,
    status             NVARCHAR(20)      NOT NULL,
    start_date         DATE              NULL,
    employee_id        INT               NULL,
    CONSTRAINT pk_hiring_candidates PRIMARY KEY (id),
    CONSTRAINT uq_hiring_candidates_id_company UNIQUE (id, company_id),
    CONSTRAINT ck_hiring_candidates_first_name CHECK (LEN(first_name) > 0),
    CONSTRAINT ck_hiring_candidates_last_name CHECK (LEN(last_name) > 0),
    CONSTRAINT ck_hiring_candidates_source CHECK (
        source IS NULL OR source IN (N'Referral', N'Job board', N'Walk-in', N'Agency', N'Website', N'Internal')
    ),
    CONSTRAINT ck_hiring_candidates_status CHECK (
        status IN (N'Shortlisted', N'Selected', N'Hire confirmed', N'Converted', N'Not selected')
    ),
    CONSTRAINT fk_hiring_candidates_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_hiring_candidates_request FOREIGN KEY (hiring_request_id, company_id) REFERENCES dbo.hiring_requests (id, company_id),
    CONSTRAINT fk_hiring_candidates_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE INDEX ix_hiring_candidates_company_id ON dbo.hiring_candidates (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0012');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
