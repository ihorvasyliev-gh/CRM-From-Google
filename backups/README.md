# Инструкция по резервному копированию (Backup) Supabase

Поскольку на бесплатном тарифе (Free Tier) Supabase нет автоматических ежедневных бэкапов, вам необходимо делать их вручную или настроить автоматизацию. Так как Supabase — это стандартная база данных PostgreSQL, у вас есть множество удобных способов сделать полный бэкап бесплатно.

В этой инструкции описаны **5 способов**:
1. [Через графический интерфейс (DBeaver / pgAdmin)](#1-через-графический-интерфейс-dbeaver--pgadmin-самый-простой) (Без использования терминала).
2. [Через консоль с помощью `pg_dump`](#2-через-командную-строку-pg_dump) (Локально на компьютере).
3. [Автоматически в Cloudflare R2](#3-автоматический-бэкап-в-cloudflare-r2-рекомендуется) (Каждую ночь, база + файлы, зашифровано).
4. [Резервное копирование файлов из Supabase Storage](#4-бэкап-файлов-из-хранилища-supabase-storage) (Картинки, документы и т.д.).
5. [Скрипт `backup.ps1`](#5-скрипт-backupps1-только-данные-таблиц) (Только данные таблиц, без установки `pg_dump`).

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

## 3. Автоматический бэкап в Cloudflare R2 (Рекомендуется)
Workflow [`.github/workflows/supabase-backup.yml`](../.github/workflows/supabase-backup.yml) каждую ночь (02:17 UTC) делает полный бэкап и кладёт его в приватный бакет Cloudflare R2 (10 ГБ бесплатно):

* **База:** `roles.sql`, `schema.sql`, `data.sql` через `supabase db dump`, как в официальной инструкции Supabase. В данные входят и пользователи (`auth.users`).
* **Файлы Storage:** все бакеты (`templates`, `pdf-forms`, …) скачиваются скриптом [`dump_storage.mjs`](dump_storage.mjs).
* Всё упаковывается в один архив `crm-backup_ГГГГ-ММ-ДД_ЧЧММ.7z`, зашифрованный паролем (AES-256, имена файлов тоже скрыты). В R2 и GitHub данные студентов в открытом виде не попадают.
* **Хранение:** `daily/` — последние 30 дней, `monthly/` — первая копия каждого месяца, хранится год. Срок можно поменять в `KEEP_DAILY_DAYS` / `KEEP_MONTHLY_DAYS` в начале workflow.
* Если бэкап упал, GitHub пришлёт письмо. Сколько строк в каждой таблице, видно на странице запуска (Actions → Supabase backup → запуск).

### Шаг 1: Бакет и ключ в Cloudflare R2
1. Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**, например `crm-backups`. Публичный доступ не включайте.
2. На странице R2 (Overview) скопируйте **Account ID**.
3. **Manage API tokens** → **Create API token** (Account API token):
   * Permissions: **Object Read & Write**;
   * Specify bucket: только `crm-backups`.
4. Сохраните **Access Key ID** и **Secret Access Key**: они показываются один раз.

### Шаг 2: Данные Supabase
* **Строка подключения:** Supabase → кнопка **Connect** → **Session pooler** → URI. Нужен именно Session pooler (`...pooler.supabase.com:5432`): прямой адрес `db.xxx.supabase.co` работает только по IPv6, которого у GitHub нет. Подставьте пароль БД; если в нём есть спецсимволы (`@`, `#`, `/`, `%`…), закодируйте их (например, `@` → `%40`) или смените пароль на буквы и цифры.
* **URL проекта** (`https://xxx.supabase.co`) и **service_role / secret key**: Project Settings → **API Keys**.

### Шаг 3: Секреты в GitHub
Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**. Создайте 8 секретов:

| Секрет | Что вставить |
|---|---|
| `SUPABASE_DB_URL` | URI из Session pooler с паролем |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (`eyJ...`) или secret key (`sb_secret_...`) |
| `R2_ACCOUNT_ID` | Account ID из Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key ID токена R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key токена R2 |
| `R2_BUCKET` | имя бакета, например `crm-backups` |
| `BACKUP_PASSWORD` | длинный пароль для архивов, придумайте сами |

> ⚠️ **Сохраните `BACKUP_PASSWORD` в менеджере паролей.** Без него архивы не открыть, а из GitHub секрет потом не прочитать.

### Шаг 4: Проверка
**Actions → Supabase backup → Run workflow.** Через пару минут архив появится в бакете R2 в папке `daily/`. Если не задан какой-то секрет, первый шаг напишет, какой именно.

> Если репозиторий публичный: GitHub отключает расписание после 60 дней без коммитов и присылает об этом письмо. Включить обратно: Actions → Supabase backup → **Enable workflow**.

### Восстановление из архива
1. Скачайте архив: Cloudflare → R2 → бакет → `daily/` или `monthly/` → **Download**.
2. Откройте его в [7-Zip](https://www.7-zip.org/) с паролем `BACKUP_PASSWORD`. Внутри `db/` (три `.sql`) и `storage/` (файлы по бакетам).
3. Восстановите базу (в новый проект Supabase или в этот же; нужен `psql`, см. раздел 2):
   ```powershell
   psql --single-transaction --variable ON_ERROR_STOP=1 `
        --file db/roles.sql --file db/schema.sql `
        --command 'SET session_replication_role = replica' `
        --file db/data.sql `
        --dbname "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
   ```
   В **существующую** базу с данными так не загрузить (таблицы уже есть): восстанавливайте в чистый проект, а уже оттуда переносите нужное.
4. Файлы из `storage/<бакет>/` загрузите обратно в одноимённые бакеты (Supabase → Storage → Upload), сохранив структуру папок. Строки о файлах (`storage.objects`) уже вернулись вместе с `data.sql`.

---

## 4. Бэкап файлов из хранилища (Supabase Storage)
Утилита `pg_dump` сохраняет **только данные таблиц**. Картинки, PDF-файлы и другие документы, которые вы загружаете в бакеты (Storage), не попадают в этот файл бэкапа.

Поскольку хранилище Supabase совместимо с протоколом S3 (Amazon S3), вы можете легко скачать все ваши файлы с помощью утилиты **rclone**.

Ночной бэкап из раздела 3 уже скачивает все файлы. Ниже — как сделать это вручную на своём компьютере.

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

## 5. Скрипт `backup.ps1` (только данные таблиц)
`backup.ps1` запускает `dump_data.cjs`, который сохраняет **данные** всех таблиц схемы `public` в `backups/supabase_data_<дата>.sql` (схему не сохраняет — она в `supabase/schema.sql` и миграциях).

* Все таблицы читаются из одного снимка базы, значения сохраняются в формате PostgreSQL: даты не сдвигаются часовым поясом компьютера, массивы и JSON восстанавливаются как есть.
* Чтобы скрипт проверял сертификат сервера, скачайте сертификат в **Project Settings -> Database -> SSL Configuration** и укажите путь к нему: `$env:SUPABASE_CA_CERT = "C:\path\prod-ca-2021.crt"`. Без него соединение шифруется, но сервер не проверяется (скрипт предупредит).
* При ошибке скрипт завершается с кодом 1 и не оставляет недописанный файл.

Восстановление (в базу с той же схемой; существующие данные этих таблиц заменяются, всё в одной транзакции):
```powershell
psql "postgresql://postgres.[your-project-ref]:[your-password]@aws-0-[region].pooler.supabase.com:5432/postgres" -v ON_ERROR_STOP=1 -f backups/supabase_data_XXXX.sql
```
Файл отключает триггеры на время загрузки (`session_replication_role = replica`), чтобы строки вернулись ровно такими, какими были сохранены. Если у роли нет такого права, будет предупреждение: тогда триггеры сработают и, например, старые повторные записи на один курс не восстановятся.

---

## Как восстановить базу из бэкапа?
Если вам потребуется восстановить базу данных из `.sql` файла, выполните команду `psql` (или сделайте это через DBeaver):

```powershell
psql "postgresql://postgres.[your-project-ref]:[your-password]@aws-0-[region].pooler.supabase.com:6543/postgres" -f backups/supabase_backup_XXXXXXXX.sql
```
