# 🔍 Аудит логики CRM-приложения

Полный анализ потенциальных багов и проблем в SQL-бэкенде и фронтенде.

---

## Критичность

| Иконка | Уровень | Значение |
|--------|---------|----------|
| 🔴 | **HIGH** | Баг может привести к потере данных или некорректным данным в БД |
| 🟡 | **MEDIUM** | Баг влияет на UX или может вызвать ошибку при определённых условиях |
| 🟢 | **LOW** | Мелкая проблема, не ломает функционал |

---

## SQL / Бэкенд

---

### 🔴 BUG-1: `submit_employment_status` — та же проблема с общим email

**Файл:** [schema.sql#L435-L438](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/supabase/schema.sql#L435-L438)

Та же проблема, что мы только что починили для `public_confirm_enrollment`: функция `submit_employment_status` ищет студента по email с `LIMIT 1`. Если мама и сын используют один email — анкета о трудоустройстве запишется только на маму, сын никогда не сможет ответить.

```sql
-- Текущий код:
SELECT id, email INTO v_student_id, v_student_email
FROM students
WHERE lower(trim(email)) = lower(trim(p_email))
LIMIT 1;  -- ← всегда берёт первого
```

> [!IMPORTANT]
> Аналогична проблеме, которую мы только что решили для подтверждения. Нужен такой же пикер имён или уточнение по `student_id`.

---

### 🟡 BUG-2: `public_confirm_enrollment` (старая версия в schema.sql) — нет `LIMIT 1` = неопределённый результат

**Файл:** [schema.sql#L253-L254](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/supabase/schema.sql#L253-L254)

```sql
SELECT id INTO v_student_id
FROM students WHERE lower(trim(email)) = lower(trim(p_email));
```

Если по email найдено несколько студентов, PostgreSQL вернёт **произвольного** (без `ORDER BY` и `LIMIT 1` результат не детерминирован). Это значит, что при повторных вызовах могут подтвердиться разные люди.

> [!NOTE]
> Миграция 35 решает эту проблему добавлением `p_student_id`, но `schema.sql` ещё содержит старую версию функции (без 3-го параметра). Нужно обновить `schema.sql`.

---

### 🟡 BUG-3: Expired confirmation tokens никогда не чистятся

**Файл:** [05_confirmation_tokens.sql](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/supabase/05_confirmation_tokens.sql)

Таблица `confirmation_tokens` имеет `expires_at` (90 дней), но **нет механизма удаления** просроченных токенов. Со временем таблица будет расти неограниченно. Индекс `idx_confirmation_tokens_expires` есть, но `DELETE` нигде не вызывается.

**Решение:** Добавить cron-задачу в Supabase (pg_cron) или периодический cleanup:
```sql
DELETE FROM confirmation_tokens WHERE expires_at < now();
```

---

### 🟡 BUG-4: `create_confirmation_token` — бесконечный цикл при исчерпании пространства токенов

**Файл:** [schema.sql#L334-L340](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/supabase/schema.sql#L334-L340)

```sql
LOOP
    v_token := '';
    FOR v_i IN 1..7 LOOP
        v_token := v_token || substr(v_chars, ...);
    END LOOP;
    IF NOT EXISTS (...) THEN EXIT; END IF;
END LOOP;  -- ← нет ограничения на количество итераций
```

Хотя пространство 54^7 ≈ 1.3 трлн комбинаций — теоретически бесконечного цикла не будет, но нет safeguard. Если что-то пойдёт не так (баг, race condition), функция зависнет навечно.

---

### 🟡 BUG-5: `merge_students` — race condition при одновременных операциях

**Файл:** [23_merge_students_rpc.sql](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/supabase/23_merge_students_rpc.sql)

Функция `merge_students` не использует `SELECT ... FOR UPDATE` при выборке студентов и enrollments. Если два администратора одновременно мержат одного и того же студента, возможна потеря данных — enrollments могут быть удалены дважды или перенесены на удалённый профиль.

---

## Фронтенд

---

### 🔴 BUG-6: `todayISO()` возвращает дату UTC, а не локальную

**Файлы:** [useInviteFlow.ts#L9-L11](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useInviteFlow.ts#L9-L11), [useEnrollments.ts#L9-L11](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useEnrollments.ts#L9-L11), [useBulkActions.ts#L8-L10](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useBulkActions.ts#L8-L10)

```typescript
function todayISO(): string {
    return new Date().toISOString().split('T')[0];
    //      ^^^^^^^^^^^^^^^^^ — это UTC!
}
```

Ирландия использует GMT+0 зимой и IST (GMT+1) летом. Если администратор отправляет приглашение в **23:30 летом** — `toISOString()` вернёт уже **следующий день** (UTC = IST - 1). В итоге:
- `invited_date` запишется как завтрашняя дата
- `completed_date` при завершении тоже будет на день вперёд

**Правильно:**
```typescript
function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
```

---

### 🔴 BUG-7: `dateUtils.ts` — форматирование дат сдвигается на день

**Файл:** [dateUtils.ts#L5-L9](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/dateUtils.ts#L5-L9)

```typescript
export function formatDateDMY(dateStr: string): string {
    const d = new Date(dateStr);  // '2026-07-20' → UTC midnight
    return d.toLocaleDateString('en-IE', ...);  // → может показать 19 июля!
}
```

`new Date('2026-07-20')` парсит как **UTC midnight**. При форматировании в IST (UTC+1) это нормально, но если пользователь окажется в часовом поясе позади UTC (напр. при удалённой работе из Америки) — дата сдвинется на день назад.

**Правильно:** добавить `T12:00:00` при парсинге date-only строк:
```typescript
const d = new Date(dateStr + 'T12:00:00');
```

---

### 🟡 BUG-8: `useInviteFlow` — `window.location.href = mailto:` может прервать HTTP-запросы

**Файл:** [useInviteFlow.ts#L150](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useInviteFlow.ts#L150)

```typescript
inviteMutation.mutate({ ids, date: inviteDate, days: responseDays });
// ... clipboard copy ...
window.location.href = `mailto:?bcc=${bcc}&subject=${subject}`;
```

`inviteMutation.mutate()` — это **fire-and-forget**. Сразу после него код меняет `window.location.href`, что в некоторых браузерах может **прервать незавершённый HTTP-запрос** к Supabase. В итоге:
- В UI статус поменяется на `invited` (оптимистичное обновление)
- Но в базе данных обновление может не дойти

**Решение:** Дождаться завершения мутации перед навигацией, или использовать `window.open()` для mailto.

---

### 🟡 BUG-9: Optimistic update rollback не работает при пустом кэше

**Файл:** [useEnrollments.ts#L181-L183](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useEnrollments.ts#L181-L183)

```typescript
onError: (_err, _variables, context) => {
    if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
    //  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ — undefined если кэш был пуст
}
```

Если React Query кэш ещё не заполнен (первый запуск, ошибка загрузки), `previousEnrollments` будет `undefined`, и откат **не произойдёт**. UI останется с неверными оптимистичными данными.

**Решение:** Добавить fallback: `queryClient.invalidateQueries({ queryKey: ['enrollments'] })`.

---

### 🟡 BUG-10: `handleCopyEmails` — нет try/catch для Clipboard API

**Файл:** [useBulkActions.ts#L238](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useBulkActions.ts#L238)

```typescript
await navigator.clipboard.writeText(emailStr);
```

Clipboard API может выбросить исключение (окно не в фокусе, браузерные ограничения). Без `try/catch` это будет unhandled rejection — toast с ошибкой не покажется.

---

### 🟢 BUG-11: `useConfirmationNotifier` — очистка `notifiedIds` удаляет все ID разом

**Файл:** [useConfirmationNotifier.ts#L65-L67](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/hooks/useConfirmationNotifier.ts#L65-L67)

```typescript
if (notifiedIds.current.size > 500) {
    notifiedIds.current.clear();  // ← полная очистка
}
```

После очистки любой следующий realtime event для недавно подтверждённых enrollments вызовет **повторное уведомление**. Лучше использовать FIFO: удалять самые старые записи, а не все.

---

### 🟢 BUG-12: `todayISO()` дублируется в 4 файлах

**Файлы:** useInviteFlow.ts, useEnrollments.ts, useBulkActions.ts, EnrollmentBoard.tsx

Одна и та же функция скопирована в 4 места. Если починить баг с UTC (BUG-6) — нужно будет менять в 4 местах. Лучше вынести в `dateUtils.ts`.

---

## Сводная таблица

| # | Уровень | Проблема | Компонент |
|---|---------|----------|-----------|
| 1 | 🔴 | `submit_employment_status` — общий email | SQL |
| 2 | 🟡 | `public_confirm_enrollment` — нет ORDER BY | SQL |
| 3 | 🟡 | Expired tokens не чистятся | SQL |
| 4 | 🟡 | `create_confirmation_token` — нет лимита итераций | SQL |
| 5 | 🟡 | `merge_students` — race condition | SQL |
| 6 | 🔴 | `todayISO()` возвращает UTC вместо локальной | Frontend |
| 7 | 🔴 | `dateUtils.ts` — сдвиг даты при парсинге | Frontend |
| 8 | 🟡 | `mailto:` может прервать HTTP-запрос | Frontend |
| 9 | 🟡 | Optimistic rollback не работает при пустом кэше | Frontend |
| 10 | 🟡 | Clipboard API без try/catch | Frontend |
| 11 | 🟢 | Очистка notifiedIds — повторные уведомления | Frontend |
| 12 | 🟢 | `todayISO()` дублируется в 4 файлах | Frontend |
