const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Берём строку подключения из аргументов или переменной окружения
const connectionString = process.argv[2] || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('Ошибка: Передайте строку подключения к БД.');
  process.exit(1);
}

// Конфигурируем клиент с поддержкой SSL (обязательно для Supabase)
const client = new Client({ 
  connectionString,
  ssl: { rejectUnauthorized: false } 
});

// Слушаем ошибки на самом инстансе клиента, чтобы избежать падений процесса
client.on('error', (err) => {
  console.error('Критическая ошибка подключения:', err.message);
});

// Функция для безопасного экранирования значений в SQL
function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return val.toString();
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${val.toString().replace(/'/g, "''")}'`;
}

async function run() {
  try {
    await client.connect();
    console.log('Успешное подключение к Supabase базе данных.');

    // Получаем список всех пользовательских таблиц в схеме public
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Найдено таблиц: ${tables.length}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupFile = path.join(__dirname, `supabase_data_${timestamp}.sql`);
    const writeStream = fs.createWriteStream(backupFile, { encoding: 'utf8' });

    writeStream.write(`-- Резервная копия данных Supabase\n`);
    writeStream.write(`-- Дата создания: ${new Date().toLocaleString()}\n\n`);
    writeStream.write(`BEGIN;\n\n`);
    writeStream.write(`SET CONSTRAINTS ALL DEFERRED;\n\n`);

    for (const table of tables) {
      console.log(`Экспорт таблицы ${table}...`);
      writeStream.write(`-- Таблица: ${table}\n`);
      writeStream.write(`TRUNCATE TABLE "${table}" CASCADE;\n\n`);

      // Запрашиваем только НЕгенерируемые колонки
      const colsRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1 
          AND is_generated = 'NEVER'
        ORDER BY ordinal_position;
      `, [table]);
      const columns = colsRes.rows.map(r => r.column_name);

      if (columns.length === 0) continue;

      // Выгружаем данные
      const rowsRes = await client.query(`SELECT * FROM "${table}"`);
      if (rowsRes.rows.length === 0) {
        console.log(`Таблица ${table} пуста.`);
        writeStream.write(`-- (Нет данных)\n\n`);
        continue;
      }

      const colList = columns.map(c => `"${c}"`).join(', ');
      for (const row of rowsRes.rows) {
        const valList = columns.map(c => escapeValue(row[c])).join(', ');
        writeStream.write(`INSERT INTO "${table}" (${colList}) VALUES (${valList});\n`);
      }
      writeStream.write(`\n`);
      console.log(`Успешно экспортировано строк: ${rowsRes.rows.length}`);
    }

    writeStream.write(`COMMIT;\n`);
    writeStream.end();

    console.log(`\nРезервное копирование завершено! Файл сохранен в: ${backupFile}`);
  } catch (err) {
    console.error('Ошибка создания бэкапа:', err);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Игнорируем ошибку при закрытии, если оно уже закрыто
    }
  }
}

run();
