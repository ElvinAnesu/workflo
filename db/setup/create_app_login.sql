-- Creates the SQL login the Workflo app connects with. Run once per server
-- as an administrator, after switching the server to "SQL Server and Windows
-- Authentication mode".
--
--   sqlcmd -S <server> -E -C -b -i db/setup/create_app_login.sql -v AppPassword="<strong password>"
--
-- The app can read and write data but cannot change the schema; migrations
-- are run separately by an administrator.

SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'workflo_app')
    CREATE LOGIN workflo_app WITH PASSWORD = N'$(AppPassword)', DEFAULT_DATABASE = workflo, CHECK_POLICY = ON;
GO

USE workflo;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'workflo_app')
    CREATE USER workflo_app FOR LOGIN workflo_app;
GO

ALTER ROLE db_datareader ADD MEMBER workflo_app;
ALTER ROLE db_datawriter ADD MEMBER workflo_app;
GO
