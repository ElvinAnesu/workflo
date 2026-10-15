-- 0006: company-scoped shifts.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0006_shifts.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0006')
BEGIN
    PRINT N'0006_shifts already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.shifts (
    id             INT IDENTITY(1,1) NOT NULL,
    company_id     INT               NOT NULL,
    name           NVARCHAR(200)     NOT NULL,
    branch_id      INT               NOT NULL,
    department_id  INT               NULL,
    start_time     TIME(0)           NOT NULL,
    end_time       TIME(0)           NOT NULL,
    created_at     DATETIME2(0)      NOT NULL CONSTRAINT df_shifts_created_at DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2(0)      NOT NULL CONSTRAINT df_shifts_updated_at DEFAULT SYSUTCDATETIME(),
    created_by     INT               NULL,
    updated_by     INT               NULL,
    CONSTRAINT pk_shifts PRIMARY KEY (id),
    CONSTRAINT uq_shifts_company_branch_department_name UNIQUE (company_id, branch_id, department_id, name),
    CONSTRAINT ck_shifts_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT ck_shifts_times_differ CHECK (start_time <> end_time),
    CONSTRAINT fk_shifts_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_shifts_branch FOREIGN KEY (branch_id, company_id) REFERENCES dbo.branches (id, company_id),
    CONSTRAINT fk_shifts_department FOREIGN KEY (department_id, company_id) REFERENCES dbo.departments (id, company_id),
    CONSTRAINT fk_shifts_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_shifts_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_shifts_company_id ON dbo.shifts (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0006');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
