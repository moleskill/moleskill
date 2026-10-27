# API для клиентов (Android, Windows и др.)

Все API-запросы (кроме `/api/auth/*`) требуют сессию. Нативное приложение входит через `POST /api/auth/login` с заголовком `X-Client: native` и телом `{ "email", "password" }`; в ответе приходит `{ "ok": true, "token": "<token>" }`. Токен передаётся как `Authorization: Bearer <token>` в каждом запросе (в вебе то же самое делает защищённая cookie `ms_session`). Токен действует 30 дней; при `401` покажите экран входа заново. Не отправляйте ID пользователя как `userId`: сервер определяет его по токену. Ошибки API возвращаются как `{ "error": "<код>" }`; неавторизованный API-запрос получает `401` JSON.

**Аутентификация** (все `POST`, JSON; повторные попытки ограничены, при `429` смотрите `Retry-After`):

| Запрос | Тело | Результат |
| --- | --- | --- |
| `/api/auth/register` | `{ email, password, termsAccepted: true, lang? }` | `{ ok, next: "verify" }`, на почту уходит 6-значный код |
| `/api/auth/verify` | `{ email, code }` | подтверждает почту и входит; `{ ok, token? }` |
| `/api/auth/resend` | `{ email, lang? }` | повторно шлёт код регистрации (не чаще раза в минуту) |
| `/api/auth/login` | `{ email, password }` | `{ ok, token? }` или `{ ok, next: "verify" }`, если почта не подтверждена |
| `/api/auth/forgot` | `{ email, lang? }` | шлёт код сброса пароля (ответ всегда `{ ok: true }`) |
| `/api/auth/reset` | `{ email, code, password }` | меняет пароль, завершает остальные сессии, входит |
| `/api/auth/logout` | — | завершает текущую сессию |
| `GET /api/auth/me` | — | `{ id, email, lang }` |

Коды ошибок: `invalid_email`, `password_short`, `password_long`, `password_weak`, `terms_required`, `invalid_credentials`, `invalid_code`, `expired_code`, `too_many_attempts`, `rate_limited`, `email_failed`. Вход через Google работает только в браузере (`GET /api/auth/google`).

Для нативного клиента: храните токен в защищённом хранилище (Android Keystore / Windows Credential Locker), не в открытых файлах.

**Рабочее пространство.** Данные (встречи, задачи, вопросы, загрузки) принадлежат рабочему пространству. Выбирайте его заголовком `X-Workspace-Id: <id>`; без заголовка используется личное пространство, поэтому клиенты, написанные до появления команд, работают как раньше. Чужое пространство даёт `403 forbidden_workspace`. Список своих пространств: `GET /api/workspaces`.
При `429` смотрите заголовок `Retry-After` (секунды).

## Загрузка записи (рекомендуется)

1. `POST /api/uploads` с `{ "filename": "rec.m4a", "contentType": "audio/mp4", "size": 1234567 }`
   → `{ "path", "uploadUrl", "token", "method": "PUT", "maxBytes", "expiresInSec" }`
2. Отправьте файл в Storage по `uploadUrl`. Проще всего официальным клиентом: в supabase-kt есть `uploadToSignedUrl(path, token, data)` (проверьте сигнатуру в вашей версии). Без SDK это `PUT` на `uploadUrl` с multipart-полем `cacheControl` и файлом в поле с пустым именем, как делает supabase-js; заголовки `apikey` и `Authorization: Bearer <anon key>`, `x-upsert: false`.
3. `POST /api/uploads/complete` с `{ "path", "title"?, "deleteAudio"?, "recordedAt"?, "durationSec"? }` → `{ "id" }`. `recordedAt` — ISO timestamp (не более чем на 5 минут в будущем и не старше 10 лет), `durationSec` — целое число 0…86400. Поля необязательны, поэтому старые клиенты продолжают работать. Повторный вызов безопасен и вернёт ту же встречу.

Для автоматических частей одной длинной микрофонной записи клиент загружает все файлы отдельно, затем вызывает тот же endpoint один раз с `{ "seriesId", "title"?, "deleteAudio"?, "parts": [{ "path", "recordedAt", "durationSec", "partNo", "partCount" }] }`. Ответ расширен до `{ "id", "ids", "seriesId" }`; обработка частей запускается после проверки и создания всех строк. `partNo` начинается с 1, `partCount` одинаков для всех частей.

Коды ошибок: `audio_required`, `unsupported_audio_format`, `file_too_large`, `too_many_processing`, `rate_limited`, `upload_missing`, `invalid_upload`, `upload_failed`.

`POST /api/meetings` (multipart `file`, `title`, `deleteAudio`) работает по-прежнему, но на Vercel принимает только файлы примерно до 4,5 МБ.

## Остальное

| Метод и путь | Назначение |
| --- | --- |
| `GET /api/me/meetings` | Последние 50 встреч с задачами; есть `audioDeletedAt`, `updatedAt` и nullable metadata `recordedAt`, `durationSec`, `language`, `speakerNames`, `processingStage`, `seriesId`, `partNo`, `partCount` |
| `PATCH /api/meetings/{id}` | Название, теги, избранное, `speakerNames` (ключи `s1`…`s99`, имя до 40 символов; `{}` означает «пропустить») |
| `DELETE /api/meetings/{id}` | Удалить встречу, задачи и аудио; для встречи из серии удаляет все части серии |
| `GET /api/meetings/{id}/audio-url` | Выдать свежий signed URL аудио на 10 минут; встреча должна принадлежать выбранному workspace |
| `GET /api/meetings/{id}/shares` | Действующие ссылки встречи/серии (без исходных токенов) |
| `POST /api/meetings/{id}/shares` | `{ "expiresInDays": 1|7|30, "showTranscript": boolean, "showAudio": boolean }`; ответ с исходным 32-байтовым base64url токеном возвращается один раз, в БД хранится SHA-256 |
| `DELETE /api/meetings/{id}/shares/{shareId}` | Отозвать ссылку |
| `DELETE /api/meetings/{id}/audio` | Удалить только аудио готовой встречи (`409`, если она ещё не готова) |
| `POST /api/meetings/{id}/retry` | Повторить обработку упавшей или зависшей встречи |
| `PATCH /api/meetings/{id}/transcript` | Исправить транскрипт (сегменты обновляются вместе с ним) |
| `POST /api/meetings/{id}/translate` | Перевести транскрипт встречи на русский; ответ `{ "transcript", "cached" }`. Перевод сохраняется отдельно и не меняет оригинал |
| `GET /api/tasks` | Задачи по всем встречам, постранично (подходит для календаря): `status`, `from`, `to`, `needsReview=1`, `limit`, `cursor` |
| `PATCH /api/tasks/{id}` | Правка задачи, см. ниже |
| `POST /api/ask` | `{ "question", "meetingId"? }`; лимит 8 в минуту |

**Голосовой ассистент MoleSkill AI.** `POST /api/assistant`: либо `multipart/form-data` с полем `audio` (короткая запись, до 4 МБ, лучше `audio/webm` или `audio/mp4`), либо JSON `{ "text": "..." }`; необязательное поле `history`: массив из последних вопросов пользователя (до 3). Ответ: `{ kind: "meetings" | "tasks" | "chat", transcript, answer, speech, sources?, tasks? }`, где `speech` это короткий текст для озвучивания, `sources` те же ссылки на моменты записи, что и в `/api/ask`, а `tasks` список открытых задач. Ассистент ничего не изменяет. Ошибки: `no_speech` (422), `audio_too_large` (413), `stt_not_configured` (503), `stt_failed` / `ai_failed` (502), `429` при превышении лимита (8 в минуту, 120 в сутки).

`GET /api/meetings/status` дополнительно отдаёт этап обработки для активных встреч: `uploaded`, `transcribing` или `analyzing`; `processingStage` равен `null` после `DONE` или `ERROR`. Публичная read-only страница ссылки доступна по `/s/{token}`; она показывает только разрешённые флаги и не требует сессии.

Статусы встречи: `PROCESSING`, `DONE`, `ERROR`. Если `PROCESSING` длится больше 10 минут, сервер сам повторит обработку (до 3 попыток), а потом выставит `ERROR`.

Встреча может содержать nullable `seriesId`, `partNo`, `partCount`. Для одной серии `seriesId` общий, `partNo` начинается с 1; клиентские API получают эти поля дополнительно в `GET /api/me/meetings`. Серии загружаются одним `POST /api/uploads/complete` с массивом `parts` (см. выше).

Для гостевого доступа используется внутренняя модель `MeetingShare`: UUID встречи, уникальный SHA-256 хэш токена, `createdBy`, `expiresAt`, `revokedAt`, `showTranscript`, `showAudio`, `createdAt`. Исходный токен существует только в ответе на создание ссылки; права выдаются явно флагами показа. Публичная ссылка не раскрывает email или сведения о рабочем пространстве.

Перевод вызывается по запросу и ограничен пятью новыми генерациями в час на пользователя; сохранённый перевод возвращается без повторного обращения к модели. При изменении оригинального транскрипта сохранённый перевод удаляется.

## Задачи: правка и неоднозначные сроки

Если в разговоре срок назван неполно («сдать до 29-го», «в марте», «к концу недели»), приложение **не угадывает дату**. Задача приходит с `dueDate: null`, `dueNeedsReview: true` и тем, что удалось услышать: `dueText` (слова из записи) и `dueDay`, `dueMonth`, `dueYear` (известные части). Клиент спрашивает у человека недостающее и отправляет его ответ.

Поля задачи: `id`, `title`, `owner`, `done`, `dueDate` (ISO-время в полночь UTC, календарный день это первые 10 символов), `dueText`, `dueDay`, `dueMonth`, `dueYear`, `dueNeedsReview`, `userEdited`, `updatedAt`.

`PATCH /api/tasks/{id}`, любые из полей (хотя бы одно):

| Поле | Значение |
| --- | --- |
| `done` | `true` / `false` |
| `title` | 1–500 символов |
| `owner` | строка до 120 символов; `null` или `""` очищает |
| `dueDate` | `"YYYY-MM-DD"` или `null` (убрать срок) |
| `dueMonth`, `dueYear` | дополняют `dueDay` из записи: `{ "dueMonth": 11, "dueYear": 2026 }` превращает «29-го» в 29.11.2026 |
| `expectedUpdatedAt` | `updatedAt`, который клиент видел в последний раз |

`dueDate` нельзя сочетать с `dueDay`, `dueMonth`, `dueYear`. Ответ: `{ "ok": true, "task": {...} }`. Ошибки: `400` (`invalid_title`, `invalid_date`, `incomplete_date`, `empty_patch` и др.), `404`, `409`.

**Параллельные правки с нескольких устройств.** Передавайте `expectedUpdatedAt`. Если задачу уже изменили, сервер ничего не запишет и вернёт `409` с актуальной версией в поле `task`: покажите её человеку, не затирая чужую правку. Задачи, которые человек правил руками или отметил выполненными, повторный анализ встречи не удаляет и не переписывает.

## Команды и роли

Роли: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`. Нарушение прав даёт `403 forbidden`.

| Право | Владелец | Админ | Участник | Наблюдатель |
| --- | :-: | :-: | :-: | :-: |
| Читать встречи и задачи, задавать вопросы | да | да | да | да |
| Загружать встречи | да | да | да | нет |
| Править и удалять встречи | любые | любые | свои | нет |
| Править задачи (включая отметку «выполнено») | да | да | да | нет |
| Участники, приглашения, переименование | да | да, но только участников и наблюдателей | нет | нет |
| Удалить пространство, назначить владельца | да | нет | нет | нет |

| Метод и путь | Назначение |
| --- | --- |
| `GET /api/workspaces` | Мои пространства с ролью |
| `POST /api/workspaces` | `{ "name" }`: создать (создатель становится владельцем) |
| `PATCH /api/workspaces/{id}` | `{ "name" }`: переименовать |
| `DELETE /api/workspaces/{id}` | Удалить со всеми встречами, записями и задачами (только владелец) |
| `GET /api/workspaces/{id}/members` | Участники и роли |
| `PATCH /api/workspaces/{id}/members/{userId}` | `{ "role" }`: сменить роль |
| `DELETE /api/workspaces/{id}/members/{userId}` | Убрать участника; со своим `userId` это выход |
| `GET /api/workspaces/{id}/invites` | Действующие приглашения |
| `POST /api/workspaces/{id}/invites` | `{ "role", "email"? }`: создать одноразовую ссылку на 7 дней; ответ содержит `url` (показывается один раз) |
| `DELETE /api/workspaces/{id}/invites/{inviteId}` | Отозвать |
| `POST /api/invites/accept` | `{ "token" }` (последняя часть ссылки): вступить, ответ содержит пространство |

Правила: у личного пространства нет участников и приглашений; последнего владельца нельзя убрать или понизить (сначала назначьте другого); приглашать сразу владельцем нельзя, владение передаётся сменой роли; админ не может создавать админов и трогать владельцев. Если у приглашения указан email, принять его может только аккаунт с этим подтверждённым адресом. Приглашения передаются по ссылке и не отправляются по почте. Коды ошибок: `forbidden`, `not_found`, `last_owner`, `personal_workspace`, `limit_reached` (10 своих пространств, 50 участников, 50 действующих приглашений), `invalid_name`, `invalid_role`, `invalid_email`, `invite_invalid`, `invite_used`, `invite_expired`, `invite_email_mismatch`.

В `GET /api/me/meetings` у встречи теперь есть `userId` (кто загрузил). В командном пространстве нет секретности внутри команды: все участники видят все встречи этого пространства.
