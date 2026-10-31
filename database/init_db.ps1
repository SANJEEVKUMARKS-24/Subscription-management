$ErrorActionPreference = 'Stop'

$hostName = 'localhost'
$port = 5432
$dbName = 'subscription_management'
$user = 'postgres'
$password = 'postgres'
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'

$env:PGPASSWORD = $password

$schemaFile = Join-Path $PSScriptRoot 'migrations\001_schema.sql'
$seedFile = Join-Path $PSScriptRoot 'migrations\002_seed.sql'
$helperFile = Join-Path $PSScriptRoot 'migrations\003_backend_helpers.sql'

Write-Host "Resetting PostgreSQL database: $dbName"
& "$pgBin\dropdb.exe" -h $hostName -p $port -U $user --if-exists $dbName
if ($LASTEXITCODE -ne 0) { throw "dropdb failed" }

& "$pgBin\createdb.exe" -h $hostName -p $port -U $user $dbName
if ($LASTEXITCODE -ne 0) { throw "createdb failed" }

Write-Host "Applying schema..."
& "$pgBin\psql.exe" -v ON_ERROR_STOP=1 -h $hostName -p $port -U $user -d $dbName -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw "schema migration failed" }

Write-Host "Loading seed data..."
& "$pgBin\psql.exe" -v ON_ERROR_STOP=1 -h $hostName -p $port -U $user -d $dbName -f $seedFile
if ($LASTEXITCODE -ne 0) { throw "seed migration failed" }

Write-Host "Applying backend helper views and functions..."
& "$pgBin\psql.exe" -v ON_ERROR_STOP=1 -h $hostName -p $port -U $user -d $dbName -f $helperFile
if ($LASTEXITCODE -ne 0) { throw "backend helper migration failed" }

Write-Host "Database initialization complete."
Write-Host ("Connection: postgresql://{0}:{1}@{2}:{3}/{4}" -f $user, $password, $hostName, $port, $dbName)