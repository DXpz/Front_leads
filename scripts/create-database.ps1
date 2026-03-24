# Crea la base de datos del proyecto en PostgreSQL (idempotente si ya existe).
# Uso: .\scripts\create-database.ps1
# Variables opcionales: $env:PGHOST, $env:PGPORT, $env:PGUSER, $env:PGPASSWORD, $env:PGDATABASE

$ErrorActionPreference = "Stop"

$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "postgres" }
$pgPort = if ($env:PGPORT) { $env:PGPORT } else { "5433" }
$pgUser = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }
$dbName = if ($env:PGDATABASE) { $env:PGDATABASE } else { "formulario_leads" }

$psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object { [int]($_.Directory.Parent.Name) } -Descending |
  Select-Object -First 1

if (-not $psql) {
  Write-Error "No se encontró psql.exe bajo C:\Program Files\PostgreSQL\. Añade psql al PATH o instala PostgreSQL."
}

$exists = & $psql.FullName -h localhost -p $pgPort -U $pgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
if ($exists -eq "1") {
  Write-Host "La base de datos '$dbName' ya existe."
  exit 0
}

& $psql.FullName -h localhost -p $pgPort -U $pgUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName ENCODING 'UTF8' TEMPLATE template0;"
Write-Host "Base de datos '$dbName' creada (puerto $pgPort, usuario $pgUser)."
