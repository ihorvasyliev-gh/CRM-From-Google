const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Берём строку подключения из аргументов или переменной окружения
const connectionString = process.argv[2] || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('Ошибка: Передайте строку подключения к БД.');
  process.exit(1);
}

// SSL обязателен для Supabase. С сертификатом Supabase (Project Settings -> Database ->
// SSL Configuration -> Download certificate, путь в SUPABASE_CA_CERT) сервер проверяется;
// без него соединение шифруется, но подлинность сервера не проверяется.
const caPath = process.env.SUPABASE_CA_CERT;
const ssl = caPath
  ? { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };
if (!caPath) {
  console.warn('Внимание: SUPABASE_CA_CERT не задан — сертификат сервера не проверяется.');
}

const client = new Client({ connectionString, ssl });

// Слушаем ошибки на самом инстансе клиента, чтобы избежать падений процесса
client.on('error', (err) => {
  console.error('Критическая ошибка подключения:', err.message);
});

// Значения читаем текстом PostgreSQL, без преобразования в объекты JS: так даты не сдвигаются
// часовым поясом компьютера, а массивы, JSON и bytea остаются в формате, который Postgres
// примет обратно для любого типа колонки.
const AS_TEXT = { getTypeParser: () => (value) => value };

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const ident = (name) => `"${name.replace(/"/g, '""')}"`;

// Порядок вставки: сначала таблицы, на которые ссылаются внешние ключи
function sortByForeignKeys(tables, references) {
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of references) {
    if (child !== parent && parents.has(child) && parents.has(parent)) parents.get(child).add(parent);
  }
  const ordered = [];
  const done = new Set();
  const visit = (table, visiting) => {
    if (done.has(table) || visiting.has(table)) return; // цикл ключей: порядок внутри него не важен при replica
    visiting.add(table);
    parents.get(table).forEach((parent) => visit(parent, visiting));
    visiting.delete(table);
    done.add(table);
    ordered.push(table);
  };
  tables.forEach((t) => visit(t, new Set()));
  return ordered;
}

async function run() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const backupFile = path.join(__dirname, `supabase_data_${timestamp}.sql`);
  let writeStream = null;

  try {
    await client.connect();
    console.log('Успешное подключение к Supabase базе данных.');

    // Один согласованный снимок всех таблиц и однозначный текстовый формат значений
    await client.query("SET TIME ZONE 'UTC'");
    await client.query("SET DateStyle = 'ISO, YMD'");
    await client.query("SET IntervalStyle = 'postgres'");
    await client.query('SET extra_float_digits = 3');
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const referencesRes = await client.query(`
      SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_class parent ON parent.oid = con.confrelid
      WHERE con.contype = 'f'
        AND child.relnamespace = 'public'::regnamespace
        AND parent.relnamespace = 'public'::regnamespace;
    `);
    const tables = sortByForeignKeys(tablesRes.rows.map((r) => r.table_name), referencesRes.rows);
    console.log(`Найдено таблиц: ${tables.length}`);

    writeStream = fs.createWriteStream(backupFile, { encoding: 'utf8' });
    const write = (text) => writeStream.write(text);

    write(`-- Резервная копия данных Supabase (схема public, только данные)\n`);
    write(`-- Дата создания: ${new Date().toLocaleString()}\n`);
    write(`-- Восстанавливается в базу с той же схемой (schema.sql + миграции).\n\n`);
    write(`SET client_encoding = 'UTF8';\n`);
    write(`SET standard_conforming_strings = on;\n\n`);
    write(`BEGIN;\n\n`);
    write(`-- Строки восстанавливаются ровно как сохранены: без триггеров (они нормализовали бы данные,\n`);
    write(`-- отбрасывали старые дубли записей и заново рассылали уведомления) и без проверки внешних\n`);
    write(`-- ключей во время загрузки. Supabase разрешает это роли postgres; без этого права таблицы\n`);
    write(`-- всё равно заполняются в порядке внешних ключей, но триггеры сработают.\n`);
    write(`DO $$\nBEGIN\n    PERFORM set_config('session_replication_role', 'replica', true);\n`);
    write(`EXCEPTION WHEN insufficient_privilege THEN\n`);
    write(`    RAISE WARNING 'Нет права менять session_replication_role: триггеры сработают при восстановлении';\n`);
    write(`END $$;\n\n`);
    if (tables.length > 0) {
      write(`TRUNCATE TABLE ${tables.map(ident).join(', ')} CASCADE;\n\n`);
    }

    const sequenceResets = [];
    for (const table of tables) {
      console.log(`Экспорт таблицы ${table}...`);
      write(`-- Таблица: ${table}\n`);

      // Запрашиваем только НЕгенерируемые колонки
      const colsRes = await client.query(`
        SELECT column_name, is_identity, identity_generation, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND is_generated = 'NEVER'
        ORDER BY ordinal_position;
      `, [table]);
      const columns = colsRes.rows.map((r) => r.column_name);
      if (columns.length === 0) continue;

      // Колонки с последовательностью: после загрузки она должна продолжить с максимума
      colsRes.rows
        .filter((r) => r.is_identity === 'YES' || (r.column_default || '').startsWith('nextval('))
        .forEach((r) => sequenceResets.push(
          `SELECT setval(pg_get_serial_sequence(${literal(`public.${ident(table)}`)}, ${literal(r.column_name)}), ` +
          `COALESCE(MAX(${ident(r.column_name)}), 1), MAX(${ident(r.column_name)}) IS NOT NULL) FROM public.${ident(table)};\n`
        ));
      const overriding = colsRes.rows.some((r) => r.identity_generation === 'ALWAYS') ? ' OVERRIDING SYSTEM VALUE' : '';

      const colList = columns.map(ident).join(', ');
      const rowsRes = await client.query({
        text: `SELECT ${colList} FROM public.${ident(table)}`,
        rowMode: 'array',
        types: AS_TEXT,
      });
      if (rowsRes.rows.length === 0) {
        console.log(`Таблица ${table} пуста.`);
        write(`-- (Нет данных)\n\n`);
        continue;
      }

      for (const row of rowsRes.rows) {
        write(`INSERT INTO public.${ident(table)} (${colList})${overriding} VALUES (${row.map(literal).join(', ')});\n`);
      }
      write(`\n`);
      console.log(`Успешно экспортировано строк: ${rowsRes.rows.length}`);
    }

    sequenceResets.forEach(write);
    write(`COMMIT;\n`);
    await client.query('COMMIT');

    await new Promise((resolve, reject) => {
      writeStream.on('error', reject);
      writeStream.end(resolve);
    });
    console.log(`\nРезервное копирование завершено! Файл сохранен в: ${backupFile}`);
  } catch (err) {
    console.error('Ошибка создания бэкапа:', err);
    process.exitCode = 1;
    // Недописанный файл выглядел бы как настоящая копия
    if (writeStream) {
      writeStream.destroy();
      fs.rmSync(backupFile, { force: true });
    }
  } finally {
    try {
      await client.end();
    } catch {
      // Игнорируем ошибку при закрытии, если оно уже закрыто
    }
  }
}

run();
