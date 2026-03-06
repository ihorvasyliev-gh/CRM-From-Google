# Полный аудит CRM-системы (Course CRM)

> Дата аудита: 2026-03-06  
> Кодовая база: React + Vite + TypeScript (frontend), Supabase (backend), Google Apps Script (интеграция)

---

## Общая оценка

| Категория | Оценка | Краткое резюме |
|---|:---:|---|
| **Архитектура и код** | 7/10 | Хорошая структура, lazy loading, React Query. Есть монолитные компоненты, дублирование кода |
| **Безопасность** | 6/10 | RLS включён, SECURITY DEFINER с search_path. Есть риски в публичных RPC и anti-devtools подходе |
| **Быстродействие** | 7/10 | Lazy loading, code splitting, optimistic updates. Нет серверной пагинации и кеш-настроек |
| **Масштабируемость** | 5/10 | Фронтенд загружает ВСЮ таблицу enrollments; нет ролевой модели; GAS обладает ограничением в 6 мин |

---

## 1. Архитектура и качество кода

### ✅ Что сделано хорошо

- **Lazy loading** компонентов через `React.lazy()` + `Suspense` — Dashboard, StudentList, CourseList и др. загружаются по требованию
- **React Query** (`@tanstack/react-query`) для управления данными — с `useMutation`, оптимистичными обновлениями и `onError` rollback
- **Типизация** через TypeScript — типы `Student`, `Course`, `Enrollment` в `types.ts`, интерфейсы для пропсов
- **Supabase Realtime** подписка в `useEnrollments.ts` (postgres_changes) — UI обновляется при внешних изменениях
- **Custom hooks**: логика хорошо декомпозирована по хукам (`useEnrollments`, `useBulkActions`, `useInviteFlow`)
- **Модульная SQL-миграция**: 13 файлов миграций, CHECK constraint на `enrollments.status`
- **Code splitting** через `vite.config.ts` с `manualChunks` для vendor

### ⚠️ Проблемы и рекомендации

#### 1.1. Монолитные компоненты
- [EnrollmentBoard.tsx](file:///e:/CRM-From-Google-main/frontend/src/components/EnrollmentBoard.tsx) — **583 строки**, содержит: фильтры, модальные окна (invite, confirm, note edit), bulk actions, полный UI
- [Dashboard.tsx](file:///e:/CRM-From-Google-main/frontend/src/components/Dashboard.tsx) — **351 строка**, смешивает fetch-логику и UI
- **Рекомендация**: вынести модальные окна в отдельные файлы, перенести Dashboard data-fetching в React Query хук

#### 1.2. Дублирование `todayISO()`
Функция `todayISO()` определена **4 раза** в разных файлах:
- `useEnrollments.ts:8`
- `useBulkActions.ts:7`
- `useInviteFlow.ts:9`
- `EnrollmentBoard.tsx:20`

**Рекомендация**: вынести в `dateUtils.ts` и импортировать.

#### 1.3. Dashboard использует `useState` + `useEffect` вместо React Query
В [Dashboard.tsx](file:///e:/CRM-From-Google-main/frontend/src/components/Dashboard.tsx) данные запрашиваются вручную через `supabase` + `useState`, не используя React Query. Это нарушает единообразие: остальной проект использует `useQuery`/`useMutation`.

#### 1.4. Нет общего Error Handling
- `ErrorBoundary.tsx` существует, но оборачивает только рендеринг. Ошибки из API-вызовов ловятся лишь в `onError` мутаций, без системного уведомления
- В Google Apps Script `_fetch()` возвращает `null` при ошибках вместо полноценного error propagation

#### 1.5. Inconsistent state management
- `setEnrollments` используется как inline wrapper над `queryClient.setQueryData` — ломает React Query's refetch behaviour если `staleTime` изменится

#### 1.6. `QueryClient` без конфигурации
```ts
const queryClient = new QueryClient() // без staleTime, retry, gcTime
```
По умолчанию: `staleTime: 0`, `retry: 3`. Нет `gcTime`, `refetchOnWindowFocus` или `refetchInterval`.

#### 1.7. Нет тестов для компонентов
Найдены тесты только для утилит (`appConfig.test.ts`, `dateUtils.test.ts`, `searchUtils.test.ts`). Нет integration/component тестов.

---

## 2. Безопасность

### ✅ Что сделано хорошо

- **RLS включён** на всех таблицах (`students`, `courses`, `enrollments`, `invite_dates`, `document_templates`, `confirmation_tokens`)
- **SECURITY DEFINER** функции с жёстко установленным `search_path = public` (миграция `09_add_constraints_and_search_path.sql`)
- **CHECK constraint** на `enrollments.status` — только разрешённые значения
- Prod build: `console.log` удаляется через `esbuild.drop: ['console', 'debugger']`
- Токены подтверждения: 7-символьные с `expires_at = 90 дней`, повторное использование для тех же course+date

### 🔴 Критические проблемы

#### 2.1. Google Apps Script использует `service_role` ключ
```js
// Code.gs:332
'Authorization': 'Bearer ' + config.key  // service_role key
```
Service role key **обходит все RLS-политики**. Если скрипт скомпрометирован — полный доступ к БД. Это архитектурно необходимо (GAS нужен полный доступ), но необходимо:
- Ограничить доступ к Script Properties
- Добавить audit logging для GAS-операций

#### 2.2. Публичные RPC уязвимы к brute-force
```sql
-- Любой anon может вызвать:
public_confirm_enrollment(p_email, p_course_id) -- перебрать email
get_public_course_info(p_course_id) -- перечислить курсы
resolve_confirmation_token(p_token) -- перебрать токены
```
**Нет rate limiting** на уровне Supabase. Злоумышленник может:
1. Перечислить все курсы по UUID brute-force
2. Подтвердить чужую запись, зная email + course_id
3. Перебрать 7-символьные токены (54^7 ≈ 1.3 трлн комбинаций — это достаточно безопасно, но стоит мониторить)

**Рекомендация**: включить Supabase Rate Limiting / добавить Edge Function с CAPTCHA перед публичными RPC.

#### 2.3. Anti-DevTools — security through obscurity
```ts
// main.tsx:32-44
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', ...); // блокировка F12, Ctrl+Shift+I
```
Это **не обеспечивает безопасность**: опытный пользователь обойдёт блокировку за секунды. К тому же, `console.log/warn/error` перезаписываются в prod, что **полностью убивает отладку в продакшене**.

**Рекомендация**: убрать anti-devtools код; полагаться на RLS и серверную валидацию.

#### 2.4. `dangerouslySetInnerHTML` в Settings preview
```tsx
// Settings.tsx:139
<div dangerouslySetInnerHTML={{ __html: previewBody }} />
```
`previewBody` формируется из `config.htmlEmailTemplate` — пользовательский ввод из `localStorage`. Если XSS попадёт в localStorage, это выполнит произвольный код.

**Рекомендация**: использовать DOMPurify для санитизации HTML перед рендерингом.

#### 2.5. Нет ролевой модели
Все залогиненные пользователи — «Admin». Единственная проверка: `auth.role() = 'authenticated'`. Любой аутентифицированный пользователь может удалить все записи.

---

## 3. Быстродействие

### ✅ Что сделано хорошо

- **Lazy loading** через `React.lazy` — тяжёлые компоненты загружаются по требованию
- **Code splitting**: `vendor` chunk выделен в vite.config.ts
- **Optimistic updates** в `useBulkActions`, `useInviteFlow`, `useEnrollments` — UI обновляется мгновенно
- **Supabase Realtime** вместо polling — обновления в реальном времени
- Индексы в БД: `idx_students_email`, `idx_students_phone`, `idx_courses_name`, FK индексы (`10_add_fk_indexes.sql`)
- Prod build удаляет `console.*` и `debugger`

### ⚠️ Проблемы и рекомендации

#### 3.1. Нет серверной пагинации — загружаются ВСЕ enrollment'ы
```ts
// useEnrollments.ts:23-27
const { data, error } = await supabase
    .from('enrollments')
    .select('*, students(...), courses(...)')
    .order('created_at', { ascending: false });
// Нет .range() или .limit()!
```
При 10 000+ enrollment'ов это приведёт к:
- Долгой начальной загрузке
- Высокому потреблению памяти
- Большому payload

#### 3.2. Dashboard делает **5 последовательных запросов**
```ts
// Dashboard.tsx:93-118
const [studRes, courseRes, enrollRes] = await Promise.all([...]); // 3 HEAD-запроса
const { data: recentData } = await supabase...                   // 4-й запрос
const { data: allEnrollments } = await supabase...select('status'); // 5-й — ВСЕ enrollments ради подсчёта статусов
```
5-й запрос загружает **все enrollment'ы** только чтобы посчитать breakdown по статусам. Это можно заменить RPC с `GROUP BY status`.

#### 3.3. `ReactQueryDevtools` загружается в production
```tsx
// main.tsx:62
<ReactQueryDevtools initialIsOpen={false} />
```
Devtools не обёрнуты в `import.meta.env.DEV`. В prod это добавит ~50-100KB к бандлу.

#### 3.4. Нет `useMemo` в некоторых вычислениях
`EnrollmentBoard` правильно использует `useMemo` для фильтрации, но `Dashboard` пересчитывает `statusBreakdown` при каждом рендере (хотя `loading` гейтирует основную часть).

#### 3.5. Google Apps Script: `Utilities.sleep(500)` в цикле sync
```js
// Code.gs:149
Utilities.sleep(500); // 500ms задержка на каждый batch из 50 строк
```
При 10 000 строках = 200 batch'ей × 500ms = **100 секунд** только на sleep.

---

## 4. Масштабируемость

### ⚠️ Текущие ограничения

#### 4.1. Клиентская фильтрация всех данных
Все фильтры (поиск, курс, вариант, даты) работают **на клиенте** — весь набор данных загружается в память и фильтруется с помощью `Array.filter()` + `Array.sort()`. Это работает для сотен записей, но не для тысяч.

#### 4.2. Single-tenant, нет multi-org поддержки
- Одна база данных → один клиент
- RLS не разграничивает по организации/tenant
- Нет `organization_id` на таблицах

#### 4.3. Google Apps Script ограничен 6 минутами
- `MAX_EXECUTION_TIME = 4.5 * 60 * 1000` — conservative, но GAS имеет жёсткий лимит в 6 минут
- Для больших листов уже реализован resumable sync через triggers — хорошее решение
- Но при параллельных пользователях GAS не масштабируется

#### 4.4. Attendance sheet — hardcoded 34 slots
```ts
// documentUtils.ts:118
for (let i = 0; i < 34; i++) { ... }
```
Жёсткий лимит в 34 участника на attendance sheet.

#### 4.5. Settings в localStorage
Настройки (email template, subject format) хранятся в `localStorage` клиента. Это означает:
- Разные настройки на разных устройствах
- Потеря настроек при очистке кеша
- Невозможность шеринга настроек между пользователями

---

## 5. Итоговая сводка рекомендаций

### 🔴 Высокий приоритет (Безопасность)
1. Добавить Rate Limiting для публичных RPC (`public_confirm_enrollment`, `resolve_confirmation_token`)
2. Санитизировать HTML в Settings preview через DOMPurify
3. Удалить anti-devtools код (security through obscurity)
4. Обернуть `ReactQueryDevtools` в `import.meta.env.DEV` check

### 🟡 Средний приоритет (Быстродействие)
5. Внедрить серверную пагинацию для enrollments (`useInfiniteQuery` / `.range()`)
6. Заменить полную загрузку статусов в Dashboard на RPC с `GROUP BY`
7. Настроить `QueryClient` с разумными `staleTime` и `gcTime`
8. Перевести Dashboard на React Query hooks

### 🟢 Низкий приоритет (Код и DX)
9. Вынести `todayISO()` в `dateUtils.ts`
10. Декомпозировать `EnrollmentBoard.tsx` — вынести модальные окна
11. Добавить component/integration тесты
12. Рассмотреть хранение Settings в Supabase вместо localStorage
13. Добавить RBAC (ролевой доступ) при появлении нескольких пользователей
