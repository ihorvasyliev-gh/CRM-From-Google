# 🔍 CRM System — Полный Аудит Проекта

> **Дата:** 5 марта 2026  
> **Объём кода:** ~4,500 строк (frontend) + ~850 строк (SQL) + ~790 строк (Google Apps Script)

---

## 📊 Общая Оценка

| Категория | Оценка | Комментарий |
|---|:---:|---|
| **Архитектура** | 🟡 6/10 | Рабочая, но есть "God Component" и отсутствует маршрутизация |
| **Безопасность** | 🟢 7/10 | RLS настроен, SECURITY DEFINER используется корректно |
| **Качество кода** | 🟡 6/10 | TypeScript strict, но дупликация и огромные файлы |
| **Производительность** | 🟡 6/10 | Realtime работает, но есть лишние re-fetch и нет пагинации |
| **Тестирование** | 🔴 1/10 | Нет ни одного теста |
| **UX/UI** | 🟢 8/10 | Профессиональный дизайн, dark/light mode, анимации |
| **Maintainability** | 🟡 5/10 | Сложно поддерживать из-за [EnrollmentBoard.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx) (1632 строки) |

---

## 🔴 Критические Проблемы

### 1. [EnrollmentBoard.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx) — "God Component" (1632 строки)

Один файл содержит **всю** бизнес-логику записей: 30+ useState, 15+ async-функций, ~800 строк JSX. Это самая серьёзная проблема проекта.

**Что в нём:** данные, фильтрация, сортировка, bulk-операции, модалки, email, токены, документы, приоритеты, заметки, delete — всё в одной функции.

**Риски:**
- Очень сложно модифицировать без регрессий
- Невозможно тестировать изолированно
- Каждый re-render потенциально пересчитывает все useMemo

> [!CAUTION]
> Рефакторинг этого файла является приоритетом #1. Рекомендуется разделить на ~5–7 модулей: hooks (`useEnrollments`, `useInviteFlow`, `useBulkActions`), под-компоненты (`EnrollmentCard`, `FilterBar`, `StatusColumn`, `BulkActionBar`).

---

### 2. Отсутствие тестов (0 из 0)

В проекте нет ни одного теста: ни unit, ни integration, ни e2e. Нет `jest`, `vitest`, `playwright`, `cypress` — даже конфигурации нет.

> [!WARNING]
> Без тестов любое изменение — это риск. Рекомендуется начать с:
> 1. Vitest для unit-тестов утилит ([appConfig.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/appConfig.ts), [documentUtils.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/documentUtils.ts), [types.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/types.ts))
> 2. React Testing Library для ключевых компонентов
> 3. Playwright или Cypress для критического flow: Login → Enrollment → Invite → Confirm

---

### 3. Маршрутизация через `window.location` вместо React Router

В [package.json](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/package.json) есть `react-router-dom`, но он **не используется**. Навигация реализована так:

```tsx
// main.tsx — ручная проверка pathname
const isConfirmPage = window.location.pathname === '/confirm' || 
                      window.location.pathname.startsWith('/c/');

// App.tsx — state-based tabs, URL не меняется
const [activeTab, setActiveTab] = useState('dashboard');
```

**Проблемы:**
- Невозможно поделиться ссылкой на конкретную страницу (students, enrollments)
- Нет истории браузера (кнопка «назад» не работает)
- React Router v6 установлен, но не задействован

---

## 🟡 Значительные Проблемы

### 4. Дублирование функций форматирования дат

Одна и та же логика форматирования дат написана в 3 разных местах:

| Файл | Функции |
|---|---|
| [EnrollmentBoard.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx) | [formatDate()](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/google-apps-script/Code.gs#360-369), [formatShortDate()](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx#95-100) |
| [documentUtils.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/documentUtils.ts) | [formatDateDMY()](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/documentUtils.ts#14-20), [formatDateLong()](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/documentUtils.ts#21-27) |
| [ConfirmationPage.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/ConfirmationPage.tsx) | Inline `toLocaleDateString()` |

Это нарушение DRY. Все должны быть в одном `dateUtils.ts`.

---

### 5. Нет пагинации — все записи загружаются сразу

```tsx
// EnrollmentBoard.tsx:233
const { data } = await supabase
    .from('enrollments')
    .select('*, students(...), courses(...)')
    .order('created_at', { ascending: false });
// ← Нет .range() или .limit()
```

При 500+ записях это создаст проблемы с производительностью. Supabase по умолчанию отдаёт 1000 строк, но при росте базы нужна пагинация или виртуализация (react-virtualized / tanstack-virtual).

---

### 6. Оптимистичные обновления с рисками рассинхронизации

Каждый [updateStatus](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx#340-441) / [bulkUpdateStatus](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx#442-559) обновляет локальный `state` сразу после Supabase-вызова:

```tsx
setEnrollments(prev => prev.map(e =>
    e.id === id ? { ...e, ...updatePayload } : e
));
```

Но параллельно работает Realtime-подписка, которая вызывает [fetchEnrollments()](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx#233-240) на каждый `postgres_changes` event. Это создаёт race conditions: состояние обновляется оптимистично, затем через ~200ms перезатирается полным fetch-ом.

---

### 7. `SECURITY DEFINER` без `search_path` (SQL)

Все RPC-функции используют `SECURITY DEFINER`, что правильно для публичного доступа, но ни одна не устанавливает `search_path`:

```sql
CREATE OR REPLACE FUNCTION public_confirm_enrollment(...)
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ⚠ Нет SET search_path = public;
```

Это потенциальная уязвимость через search_path hijacking (CWE-426). PostgreSQL рекомендует всегда указывать `SET search_path = public` для `SECURITY DEFINER` функций.

---

### 8. Статус enrollment не имеет enum-ограничения в БД

```sql
status text default 'requested', -- requested, invited, confirmed, rejected
```

`status` — это обычное текстовое поле без `CHECK` constraint. Любой API-вызов может записать произвольное значение.

**Рекомендация:**
```sql
ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check 
CHECK (status IN ('requested', 'invited', 'confirmed', 'completed', 'withdrawn', 'rejected'));
```

---

## 🟢 Что Сделано Хорошо

### ✅ TypeScript strict mode
[tsconfig.json](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/tsconfig.json) включает `strict: true`, `noUnusedLocals`, `noUnusedParameters` — это отличная практика.

### ✅ Row Level Security
Все таблицы имеют RLS-политики с проверкой `auth.role() = 'authenticated'`. Публичные функции используют `SECURITY DEFINER`.

### ✅ Realtime подписки
Изменения в enrollments мгновенно отображаются без refresh.

### ✅ Дизайн-система
Полноценная CSS-система в [index.css](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/index.css) с CSS-переменными, light/dark тема, анимации, glassmorphism.

### ✅ Централизованные типы
Все domain-типы в [types.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/types.ts) — одна точка правды.

### ✅ Конфигурация email-шаблонов
[appConfig.ts](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/appConfig.ts) с [getConfig](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/appConfig.ts#31-42) / [setConfig](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/appConfig.ts#43-50) / [resetConfig](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/lib/appConfig.ts#51-56) — чистая и расширяемая.

### ✅ Vite chunking
`manualChunks` для vendor библиотек уменьшает размер основного бандла.

### ✅ Confirmation tokens
Короткие 7-символьные токены вместо UUID в URL. Повторное использование существующих токенов.

---

## 📋 Рекомендации по Приоритетам

### Приоритет 1 — Критично
- [ ] **Разбить [EnrollmentBoard.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx)** на custom hooks + под-компоненты
- [ ] **Добавить тесты**: Vitest + React Testing Library минимум для утилит
- [ ] **Добавить CHECK constraint** на `enrollments.status`

### Приоритет 2 — Важно
- [ ] **Внедрить React Router**: заменить tab-state на URL-маршрутизацию
- [ ] **Консолидировать форматирование дат** в один `dateUtils.ts`
- [ ] **Добавить `SET search_path`** ко всем `SECURITY DEFINER` функциям
- [ ] **Решить race condition** Realtime vs оптимистичные обновления

### Приоритет 3 — Улучшения
- [ ] **Пагинация / виртуализация** для больших списков
- [ ] **Error Boundary** компонент для React
- [ ] **ESLint конфигурация** (отсутствует)
- [ ] **Убрать неиспользуемый `react-router-dom`** из зависимостей, или начать использовать
- [ ] **Добавить `package-lock.json`** в git (если ещё не добавлен)
- [ ] **Loading/error states** для всех data-fetching (некоторые компоненты не показывают ошибки)
- [ ] **Миграция SQL**: оформить как Supabase migrations вместо отдельных файлов

---

## 📁 Структура Файлов — Карта Размеров

```
frontend/src/
├── components/
│   ├── EnrollmentBoard.tsx    ████████████████████ 1632 lines ← REFACTOR
│   ├── DocumentGenerator.tsx  ████████████         811 lines
│   ├── StudentDetail.tsx      ████████             550 lines  
│   ├── Dashboard.tsx          ███████              463 lines
│   ├── StudentList.tsx        ███████              455 lines
│   ├── CourseList.tsx         ██████               380 lines
│   ├── EnrollmentModal.tsx    █████                324 lines
│   ├── ConfirmationPage.tsx   ████                 244 lines
│   ├── StudentModal.tsx       ████                 235 lines
│   ├── Settings.tsx           ████                 234 lines
│   ├── LoginPage.tsx          ██                   103 lines
│   ├── ConfirmDialog.tsx      ██                    72 lines
│   └── Toast.tsx              █                     58 lines
├── lib/
│   ├── documentUtils.ts       ██                   162 lines
│   ├── appConfig.ts           ██                    76 lines
│   ├── types.ts               ██                    73 lines
│   └── supabase.ts            █                     11 lines
├── contexts/
│   └── AuthContext.tsx        █                     63 lines
├── App.tsx                    ████                 261 lines
├── index.css                  █████                365 lines
└── main.tsx                   █                     22 lines
```

---

## 🏁 Итог

Проект — функциональный и визуально зрелый CRM с хорошей базовой безопасностью. Основные точки роста: **декомпозиция [EnrollmentBoard.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard.tsx)**, **добавление тестов**, и **внедрение полноценной URL-маршрутизации**. Решение этих трёх проблем кардинально повысит maintainability и reliability проекта.
