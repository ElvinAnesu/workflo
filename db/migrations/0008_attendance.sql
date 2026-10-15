-- 0008: company-scoped attendance.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0008_attendance.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0008')
BEGIN
    PRINT N'0008_attendance already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.attendance (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    work_date   DATE              NOT NULL,
    shift_id    INT               NOT NULL,
    employee_id INT               NOT NULL,
    status      NVARCHAR(20)      NOT NULL,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_attendance_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_attendance_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_attendance PRIMARY KEY (id),
    CONSTRAINT uq_attendance_company_date_shift_employee UNIQUE (company_id, work_date, shift_id, employee_id),
    CONSTRAINT ck_attendance_status CHECK (status IN (
        N'Present', N'Absent', N'Late', N'Half day', N'Off', N'On leave'
    )),
    CONSTRAINT fk_attendance_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id, company_id) REFERENCES dbo.shifts (id, company_id),
    CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_attendance_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_attendance_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_attendance_company_id ON dbo.attendance (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0008');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
