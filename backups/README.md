# Инструкция по резервному копированию (Backup) Supabase

Поскольку на бесплатном тарифе (Free Tier) Supabase нет автоматических ежедневных бэкапов, вам необходимо делать их вручную или настроить автоматизацию. Так как Supabase — это стандартная база данных PostgreSQL, у вас есть множество удобных способов сделать полный бэкап бесплатно.

В этой инструкции описаны **4 лучших способа**:
1. [Через графический интерфейс (DBeaver / pgAdmin)](#1-через-графический-интерфейс-dbeaver--pgadmin-самый-простой) (Без использования терминала).
2. [Через консоль с помощью `pg_dump`](#2-через-командную-строку-pg_dump) (Локально на компьютере).
3. [Автоматически через GitHub Actions](#3-автоматический-бэкап-по-расписанию-через-github-actions-рекомендуется) (Бесплатно и в облаке).
4. [Резервное копирование файлов из Supabase Storage](#4-бэкап-файлов-из-хранилища-supabase-storage) (Картинки, документы и т.д.).

---

## Где найти данные для подключения?
Для всех способов вам понадобятся учетные данные вашей базы. Их можно найти в панели управления Supabase:
1. Перейдите в **Project Settings -> Database**.
2. В разделе **Connection string** выберите вкладку **URI**.
3. Строка подключения выглядит так:
   `postgresql://postgres.[your-project-ref]:[your-password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   *Примечание: Не забудьте заменить `[your-password]` на ваш реальный пароль базы данных.*

---

## 1. Через графический интерфейс (DBeaver / pgAdmin) — Самый простой
Если вы не хотите работать в терминале, используйте бесплатный менеджер баз данных **DBeaver**:

1. Скачайте и установите [DBeaver](https://dbeaver.io/).
2. Создайте новое подключение к PostgreSQL, используя ваши данные из Supabase:
   * **Host:** `aws-0-[region].pooler.supabase.com` (или прямой хост вашей БД)
   * **Port:** `6543` (для пулпирования) или `5432` (прямое подключение)
   * **Database:** `postgres`
   * **Username:** `postgres.[your-project-ref]` (или `postgres` в зависимости от режима подключения)
   * **Password:** Ваш пароль БД.
3. После подключения кликните правой кнопкой мыши по вашей базе данных (`postgres`) -> **Tools (Инструменты)** -> **Backup (Резервное копирование)**.
4. Выберите нужные схемы (обычно `public` и `storage` для метаданных файлов).
5. Нажмите **Start** — DBeaver сам скачает `pg_dump` и сохранит `.sql` файл на ваш компьютер.

---

## 2. Через командную строку (`pg_dump`)
Если вы предпочитаете консоль, можно использовать стандартную утилиту PostgreSQL `pg_dump`.

### Шаг 1: Установка `pg_dump` на Windows
Если у вас нет установленного PostgreSQL локально, выполните команду в PowerShell для установки через менеджер пакетов Windows:
```powershell
winget install PostgreSQL.PostgreSQL
```
*(После установки перезапустите терминал, чтобы путь к `pg_dump` обновился).*

### Шаг 2: Запуск бэкапа
Создайте резервную копию базы данных (структура + данные) в папку `backups`:
```powershell
pg_dump "postgresql://postgres.[your-project-ref]:[your-password]@aws-0-[region].pooler.supabase.com:6543/postgres" --clean --if-exists --quote-all-identifiers --no-owner --no-privileges -f "backups/supabase_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
```

* **Что делают флаги:**
  * `--clean --if-exists` — добавляет команды очистки таблиц перед их восстановлением (удобно для полной перезаписи при восстановлении).
  * `--no-owner --no-privileges` — исключает специфические права владельцев, чтобы бэкап можно было развернуть на любой другой базе данных.

---

## 3. Автоматический бэкап по расписанию через GitHub Actions (Рекомендуется)
Вы можете настроить бесплатный автоматический бэкап, который будет запускаться каждую ночь и сохранять файл в ваш приватный репозиторий GitHub или отправлять его в облако (например, Google Drive или Telegram).

### Инструкция по настройке:
1. В корне вашего проекта создайте файл `.github/workflows/supabase-backup.yml`.
2. Запишите в него следующий код:

```yaml
name: Supabase Database Backup

on:
  schedule:
    # Запуск каждый день в 00:00 UTC
    - cron: '0 0 * * *'
  workflow_dispatch: # Позволяет запускать бэкап вручную из интерфейса GitHub

jobs:
  backup:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Install PostgreSQL Client
      run: |
        sudo apt-get update
        sudo apt-get install -y postgresql-client

    - name: Run pg_dump
      run: |
        mkdir -p database-backups
        pg_dump "$DATABASE_URL" --clean --if-exists --quote-all-identifiers --no-owner --no-privileges -f "database-backups/backup-$(date +'%Y-%m-%d-%H%M%S').sql"
      env:
        DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}

    - name: Commit & Push Backup
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add database-backups/
        git commit -m "Auto-backup: $(date +'%Y-%m-%d %H:%M:%S')"
        git push
```

3. Перейдите в настройки репозитория на GitHub: **Settings -> Secrets and variables -> Actions**.
4. Создайте новый секрет **`SUPABASE_DB_URL`** и вставьте туда вашу полную строку подключения (URI) с паролем.
5. **Важно:** Убедитесь, что репозиторий приватный, иначе ваши данные будут видны всем!

---

## 4. Бэкап файлов из хранилища (Supabase Storage)
Утилита `pg_dump` сохраняет **только данные таблиц**. Картинки, PDF-файлы и другие документы, которые вы загружаете в бакеты (Storage), не попадают в этот файл бэкапа.

Поскольку хранилище Supabase совместимо с протоколом S3 (Amazon S3), вы можете легко скачать все ваши файлы с помощью утилиты **rclone**.

### Шаг 1: Получите S3-ключи в Supabase
1. Перейдите в **Project Settings -> Storage**.
2. Включите **S3 Connection** (если выключено).
3. Скопируйте **S3 Endpoint** и сгенерируйте новые **Access Key** и **Secret Key**.

### Шаг 2: Настройка rclone на компьютере
1. Установите [rclone](https://rclone.org/downloads/).
2. Запустите в терминале:
   ```bash
   rclone config
   ```
3. Создайте новое подключение (например, с именем `supabase`):
   * Тип хранилища: `s3` (Amazon S3 Compliant Storage)
   * Провайдер: `Other`
   * Введите полученные **Access Key**, **Secret Key** и **Endpoint**.

### Шаг 3: Скачивание файлов
Чтобы синхронизировать все файлы из бакетов Supabase в локальную папку `backups/storage`:
```bash
rclone sync supabase:backups backups/storage --progress
```

---

## Как восстановить базу из бэкапа?
Если вам потребуется восстановить базу данных из `.sql` файла, выполните команду `psql` (или сделайте это через DBeaver):

```powershell
psql "postgresql://postgres.[your-project-ref]:[your-password]@aws-0-[region].pooler.supabase.com:6543/postgres" -f backups/supabase_backup_XXXXXXXX.sql
```
