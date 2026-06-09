# Скрипт резервного копирования данных Supabase на Windows (PowerShell)

# 1. Настройка путей
$BackupDir = $PSScriptRoot
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$DumpScript = Join-Path $BackupDir "dump_data.cjs"

# 2. Получаем строку подключения
$DbUrl = $env:SUPABASE_DB_URL

if (-not $DbUrl) {
    # Попробуем поискать файл .env в проекте
    $RootEnv = Join-Path $PSScriptRoot "..\frontend\.env"
    if (Test-Path $RootEnv) {
        $EnvContent = Get-Content $RootEnv
        $UrlLine = $EnvContent | Where-Object { $_ -match "^SUPABASE_DB_URL=" -or $_ -match "^DATABASE_URL=" }
        if ($UrlLine) {
            $DbUrl = ($UrlLine -split "=")[1].Trim().Trim('"').Trim("'")
        }
    }
}

# Если строки нет, просим пользователя ввести её
if (-not $DbUrl) {
    Write-Host "Не найдена строка подключения к базе данных Supabase." -ForegroundColor Yellow
    Write-Host "Вы можете найти её в панели Supabase -> Settings -> Database -> Connection string -> Session pooler (Port 5432) -> URI" -ForegroundColor Gray
    $DbUrl = Read-Host "Введите полную строку URI (postgresql://...)"
}

if (-not $DbUrl -or -not ($DbUrl.StartsWith("postgres"))) {
    Write-Host "Ошибка: Некорректная или пустая строка подключения!" -ForegroundColor Red
    exit 1
}

# Корректируем порт на 5432 (Session pooler), если указан транзакционный порт 6543
if ($DbUrl -match ":6543/") {
    Write-Host "Внимание: Обнаружен порт 6543 (Transaction pooler). Изменяем его на 5432 (Session pooler) для предотвращения разрыва соединения." -ForegroundColor Yellow
    $DbUrl = $DbUrl -replace ":6543/", ":5432/"
}

# 3. Проверяем наличие установленных Node.js зависимостей
$NodeModulesPath = Join-Path $PSScriptRoot "..\node_modules\pg"
if (-not (Test-Path $NodeModulesPath)) {
    Write-Host "Установка необходимых драйверов (pg)..." -ForegroundColor Gray
    npm.cmd install pg --no-save
}

# 4. Запуск резервного копирования через Node.js
Write-Host "Запуск резервного копирования данных..." -ForegroundColor Green
node $DumpScript $DbUrl

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nГотово!" -ForegroundColor Green
} else {
    Write-Host "`nОшибка резервного копирования." -ForegroundColor Red
}
