-- 0007: company-scoped timetable entries.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0007_timetable.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0007')
BEGIN
    PRINT N'0007_timetable already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

ALTER TABLE dbo.shifts
    ADD CONSTRAINT uq_shifts_id_company UNIQUE (id, company_id);

ALTER TABLE dbo.employees
    ADD CONSTRAINT uq_employees_id_company UNIQUE (id, company_id);

CREATE TABLE dbo.timetable_entries (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    shift_id    INT               NOT NULL,
    pattern     NVARCHAR(20)      NOT NULL,
    work_date   DATE              NULL,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_timetable_entries_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_timetable_entries_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_timetable_entries PRIMARY KEY (id),
    CONSTRAINT ck_timetable_entries_pattern CHECK (pattern IN (N'weekly', N'date')),
    CONSTRAINT ck_timetable_entries_pattern_date CHECK (
        (pattern = N'weekly' AND work_date IS NULL)
        OR (pattern = N'date' AND work_date IS NOT NULL)
    ),
    CONSTRAINT fk_timetable_entries_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_timetable_entries_shift FOREIGN KEY (shift_id, company_id) REFERENCES dbo.shifts (id, company_id),
    CONSTRAINT fk_timetable_entries_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_timetable_entries_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_timetable_entries_company_id ON dbo.timetable_entries (company_id);

CREATE TABLE dbo.timetable_weekdays (
    timetable_entry_id INT          NOT NULL,
    weekday            NVARCHAR(9)  NOT NULL,
    CONSTRAINT pk_timetable_weekdays PRIMARY KEY (timetable_entry_id, weekday),
    CONSTRAINT ck_timetable_weekdays_name CHECK (weekday IN (
        N'Monday', N'Tuesday', N'Wednesday', N'Thursday', N'Friday', N'Saturday', N'Sunday'
    )),
    CONSTRAINT fk_timetable_weekdays_entry FOREIGN KEY (timetable_entry_id)
        REFERENCES dbo.timetable_entries (id) ON DELETE CASCADE
);

CREATE TABLE dbo.timetable_employees (
    timetable_entry_id INT NOT NULL,
    company_id         INT NOT NULL,
    employee_id        INT NOT NULL,
    CONSTRAINT pk_timetable_employees PRIMARY KEY (timetable_entry_id, employee_id),
    CONSTRAINT fk_timetable_employees_entry FOREIGN KEY (timetable_entry_id)
        REFERENCES dbo.timetable_entries (id) ON DELETE CASCADE,
    CONSTRAINT fk_timetable_employees_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES dbo.employees (id, company_id)
);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0007');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
