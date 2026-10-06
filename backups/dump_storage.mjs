// Скачивает все файлы из всех бакетов Supabase Storage в папку (по умолчанию backups/storage).
// Используется ночным бэкапом (.github/workflows/supabase-backup.yml), можно запускать и вручную:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node backups/dump_storage.mjs [папка]
// Нужен Node 20.11+ (встроенный fetch), зависимостей нет.
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const outDir = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'storage'));

if (!baseUrl || !key) {
  console.error('Ошибка: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Новые ключи (sb_secret_...) передаются только в apikey; старый service_role (JWT) ещё и в Authorization
const headers = { apikey: key };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

const PAGE = 1000;
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function request(url, init = {}, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
      if (res.ok) return res;
      const body = await res.text();
      // 4xx (кроме 429) повторять бессмысленно
      if (i >= attempts || (res.status < 500 && res.status !== 429)) {
        throw new Error(`${init.method || 'GET'} ${url} -> ${res.status}: ${body.slice(0, 300)}`);
      }
    } catch (err) {
      if (i >= attempts || err.message.includes(' -> ')) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
}

async function listBucket(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await request(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const entries = await res.json();
    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}${entry.name}` : entry.name;
      // У «папок» нет id: заходим внутрь
      if (entry.id === null) files.push(...(await listBucket(bucket, `${fullPath}/`)));
      else files.push({ path: fullPath, size: entry.metadata?.size ?? null });
    }
    if (entries.length < PAGE) return files;
  }
}

async function run() {
  const buckets = await (await request(`${baseUrl}/storage/v1/bucket`)).json();
  console.log(`Бакетов: ${buckets.length}`);
  const manifest = [];
  let totalBytes = 0;

  for (const bucket of buckets) {
    const files = await listBucket(bucket.id);
    console.log(`Бакет ${bucket.id}: файлов ${files.length}`);
    for (const file of files) {
      const res = await request(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket.id)}/${encodePath(file.path)}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (file.size !== null && data.length !== file.size) {
        throw new Error(`${bucket.id}/${file.path}: скачано ${data.length} байт, ожидалось ${file.size}`);
      }
      const target = path.join(outDir, bucket.id, ...file.path.split('/'));
      if (!target.startsWith(outDir + path.sep)) throw new Error(`Недопустимый путь: ${bucket.id}/${file.path}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      manifest.push({ bucket: bucket.id, public: bucket.public, path: file.path, size: data.length });
      totalBytes += data.length;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ buckets, files: manifest }, null, 2));
  console.log(`Готово: файлов ${manifest.length}, ${(totalBytes / 1024 / 1024).toFixed(1)} МБ -> ${outDir}`);
}

run().catch((err) => {
  console.error('Ошибка бэкапа Storage:', err.message);
  process.exit(1);
});
