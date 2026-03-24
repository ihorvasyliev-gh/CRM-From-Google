# Важные улучшения юзабилити (UX/UI) для CRM

Основываясь на детальном анализе интерфейса, логики компонентов (`EnrollmentBoard`, [BulkActionBar](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/BulkActionBar.tsx#13-115), [StatusColumn](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/StatusColumn.tsx#18-100), [Settings](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/Settings.tsx#7-213) и других) и общей архитектуре приложения, вот 7 наиболее важных улучшений, которые сделают систему интуитивно понятнее, удобнее и безопаснее для пользователей:

## 1. Drag-and-Drop для карточек студентов
- **Проблема**: Сейчас изменение статуса студента (перевод из "Requested" в "Invited" и т.д.) осуществляется через выделение и нажатие кнопок. Это требует лишних кликов, особенно при работе с отдельными участниками.
- **Решение**: Внедрить механику Drag-and-Drop (например, библиотеку `dnd-kit` или `@hello-pangea/dnd`). Возможность просто перетаскивать карточки `EnrollmentCard` между колонками статусов [StatusColumn](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/StatusColumn.tsx#18-100) сделает доску визуальной и привычной (как в Trello/Jira).

## 2. Подтверждение критических (деструктивных) массовых действий
- **Проблема**: В панели [BulkActionBar](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/BulkActionBar.tsx#13-115) действия, такие как "Отклонить" (Rejected) или удаление (Delete Selected), могут быть нажаты случайно, что сразу применится к группе людей.
- **Решение**: Добавить всплывающее модальное окно (Confirmation Modal) для деструктивных действий. Например: *"Вы уверены, что хотите безвозвратно удалить 5 выбранных записей?"*. Это защитит от случайной потери данных.

## 3. Читаемость кнопок и видимые подсказки (Tooltips)
- **Проблема**: В интерфейсах (включая [BulkActionBar](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/BulkActionBar.tsx#13-115), иконки приоритета и редактирования заметок в карточках) интенсивно используются иконки (Lucide) со стандартным HTML-атрибутом `title`. На мобильных устройствах или планшетах `title` не работает, а новички могут не сразу понять значение иконок (например, иконка часов для "Requested" или шапочка выпускника для "Completed").
- **Решение**: Заменить нативные атрибуты `title` на красивые всплывающие подсказки (как Radix UI Tooltip), которые появляются мгновенно. Также для главной панели массовых действий можно рассмотреть добавление коротких текстовых подписей.

## 4. Контекст выделенных элементов (Selection Context)
- **Проблема**: [BulkActionBar](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/EnrollmentBoard/BulkActionBar.tsx#13-115) показывает только цифру (например, "3"), но пользователь не видит, *кто именно* сейчас выделен, особенно если выделенные карточки находятся в разных колонках или скрыты скроллом.
- **Решение**: Добавить кликабельность на счетчик выделенных элементов, которая будет открывать небольшое выпадающее меню (Popover / Drawer) со списком выбранных студентов. Там же можно будет точечно крестиком снять выделение с ошибочно выбранного человека перед массовым действием.

## 5. Защита "от дурака" в настройках шаблона писем
- **Проблема**: В компоненте [Settings.tsx](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/components/Settings.tsx) можно редактировать `htmlEmailTemplate`. Если пользователь случайно удалит шорткод `{confirmationLink}` или `{confirmationButton}`, письма будут уходить без возможности подтверждения.
- **Решение**: Добавить валидацию (в реальном времени) прямо под редактором `ReactQuill`. Если в тексте не найден ни один из критически важных шорткодов, кнопка "Save Changes" блокируется или показывается яркое предупреждение (Warning).

## 6. Live Preview (Живой предпросмотр) для шаблонов писем
- **Проблема**: Сейчас в настройках для того, чтобы увидеть, как выглядит письмо, нужно нажимать кнопку "Preview" / "Hide".
- **Решение**: На широких дисплеях (десктоп) разбить область на две колонки (Split-view). В левой половине — редактор `ReactQuill`, а в правой — мгновенно обновляющийся предпросмотр письма со вставленными тестовыми данными. Это улучшит опыт настройки системы.

## 7. Обработка ошибок соединения (Graceful Error Setup)
- **Проблема**: Если CRM открывает пользователь, у которого не настроены переменные `.env` для Supabase (или истекла сессия с ошибкой сети), [AuthContext](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/frontend/src/contexts/AuthContext.tsx#5-12) может "застрять" на белом экране без уведомлений.
- **Решение**: Реализовать экран "Требуется настройка" (Setup Required) или полноэкранный компонент ошибки (Error Boundary), который понятным языком объясняет, что нет связи с базой данных, вместо пустого экрана.

---

Если вы хотите, мы можем начать внедрять какие-либо из этих улучшений поэтапно! Напишите, что из этого для вас наиболее приоритетно.
