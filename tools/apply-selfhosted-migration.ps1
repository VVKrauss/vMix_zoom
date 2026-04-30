param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationPath,

  [string]$RemoteHost = "deploy@147.45.148.174",
  [string]$RemoteComposeDir = "~/apps/supabase/docker",
  [string]$DbService = "db",
  [string]$DbUser = "supabase_admin",
  [string]$DbName = "postgres",
  [string]$RemoteTmpDir = "/tmp"
)

$ErrorActionPreference = "Stop"

function Fail([string]$message) {
  throw $message
}

if (-not (Test-Path -LiteralPath $MigrationPath)) {
  Fail "MigrationPath not found: $MigrationPath"
}

$full = (Resolve-Path -LiteralPath $MigrationPath).Path
$file = [System.IO.Path]::GetFileName($full)

if ($file -notmatch '^(?<ver>\d{14})_(?<name>.+)\.sql$') {
  Fail "Migration filename must match `<14digits>_snake_case_name.sql`. Got: $file"
}

$version = $Matches['ver']
$name = $Matches['name']

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()

$remoteSqlPath = "$RemoteTmpDir/$file"

Write-Host "Applying migration to self-hosted Supabase"
Write-Host "  local : $full"
Write-Host "  remote: $RemoteHost:$remoteSqlPath"
Write-Host "  ver   : $version"
Write-Host "  name  : $name"
Write-Host "  sha256: $hash"

& scp $full "$RemoteHost:`"$remoteSqlPath`""

# Apply SQL by piping the file into psql running inside the Postgres container.
# Use `-u postgres` to avoid peer auth errors.
$applyCmd = @"
set -euo pipefail
cd "$RemoteComposeDir"
cat "$remoteSqlPath" | docker compose exec -T -u postgres "$DbService" psql -v ON_ERROR_STOP=1 -U "$DbUser" -d "$DbName"
"@

& ssh $RemoteHost $applyCmd

# Record application in our own history table.
$recordCmd = @"
set -euo pipefail
cd "$RemoteComposeDir"
docker compose exec -T -u postgres "$DbService" psql -v ON_ERROR_STOP=1 -U "$DbUser" -d "$DbName" -c "insert into app_migrations.schema_migrations(version,name,checksum_sha256) values ('$version','$name','$hash') on conflict (version) do update set name=excluded.name, checksum_sha256=excluded.checksum_sha256, applied_at=app_migrations.schema_migrations.applied_at;"
docker compose exec -T -u postgres "$DbService" psql -U "$DbUser" -d "$DbName" -c "select version,name,applied_at from app_migrations.schema_migrations order by applied_at desc limit 10;"
"@

& ssh $RemoteHost $recordCmd

