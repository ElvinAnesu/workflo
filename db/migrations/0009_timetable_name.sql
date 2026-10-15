-- 0009: a name on each timetable entry.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0009_timetable_name.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0009')
BEGIN
    PRINT N'0009_timetable_name already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

ALTER TABLE dbo.timetable_entries
    ADD name NVARCHAR(200) NOT NULL;
GO

ALTER TABLE dbo.timetable_entries
    ADD CONSTRAINT ck_timetable_entries_name_not_blank CHECK (LEN(name) > 0);
GO

INSERT INTO dbo.schema_migrations (version) VALUES (N'0009');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
