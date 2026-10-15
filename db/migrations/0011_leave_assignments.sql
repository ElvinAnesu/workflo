-- 0011: employees assigned to a leave type.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0011_leave_assignments.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0011')
BEGIN
    PRINT N'0011_leave_assignments already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.leave_type_employees (
    leave_type_id INT NOT NULL,
    company_id    INT NOT NULL,
    employee_id   INT NOT NULL,
    CONSTRAINT pk_leave_type_employees PRIMARY KEY (leave_type_id, employee_id),
    CONSTRAINT fk_leave_type_employees_leave_type FOREIGN KEY (leave_type_id, company_id)
        REFERENCES dbo.leave_types (id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_type_employees_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES dbo.employees (id, company_id)
);

CREATE INDEX ix_leave_type_employees_company_id ON dbo.leave_type_employees (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0011');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
