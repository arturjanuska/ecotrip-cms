# Ecotrip CMS

Next.js 16 (App Router) + Clerk + MongoDB (Mongoose). Управление сущностями Postcodes, Prices и Fees.

## Запуск локально

1. `npm install` (Node 24).
2. `cp .env.example .env.local` и заполнить значения (см. ниже).
3. Настроить Clerk (см. раздел Clerk).
4. `npm run dev` и открыть http://localhost:3000.

## Переменные окружения

| Переменная                          | Назначение                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `MONGODB_URI`                       | Строка подключения с именем базы: `mongodb+srv://user:pass@cluster.mongodb.net/ecotrip?...` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Ключ Clerk (Dashboard -> API keys)                                                          |
| `CLERK_SECRET_KEY`                  | Секретный ключ Clerk, только на сервере                                                     |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | `/login`                                                                                    |
| `CORS_ORIGINS`                      | Origin через запятую, которым разрешено читать публичные GET из браузера                    |

## Clerk

- User & authentication: вход по Username и Password.
- Restrictions: sign-up mode **Restricted** (самостоятельной регистрации нет). Настроить в development и в production инстансе отдельно.
- Пользователей создавать вручную: Users -> Create user.
- Доступ к CMS только с ролью admin: у пользователя в **Public metadata** указать `{"role": "admin"}`. Без роли пользователь попадает на `/no-access`, а API на запись отвечает 403.
- Необязательно, но быстрее: Sessions -> Customize session token -> `{"metadata": "{{user.public_metadata}}"}`. Тогда роль читается из токена, без запроса к Clerk API на каждый запрос.

## API

| Метод  | Путь                    | Доступ    |
| ------ | ----------------------- | --------- |
| GET    | `/api/postcodes`        | публичный |
| GET    | `/api/postcodes/:id`    | публичный |
| POST   | `/api/postcodes`        | admin     |
| PUT    | `/api/postcodes/:id`    | admin     |
| DELETE | `/api/postcodes/:id`    | admin     |
| PUT    | `/api/postcodes/bulk`   | admin     |
| GET    | `/api/postcodes/export` | admin     |
| POST   | `/api/postcodes/import` | admin     |

- `GET /api/postcodes` -> `{ items, total, page, limit }`, сортировка по `postcode`. Параметры (все необязательные):

| Параметр          | Значения                                                      | По умолчанию |
| ----------------- | ------------------------------------------------------------- | ------------ |
| `page`            | целое от 1                                                    | `1`          |
| `limit`           | целое от 1, больше 500 ужимается до 500                       | `50`         |
| `active`          | `true`, `false` (удалённые), `all` (все)                      | `true`       |
| `postcode`        | начало кода, до 8 букв и цифр: `M4` найдёт `M4`, `M40`, `M46` | любой        |
| `calendar`        | `Odd`, `Even`, `none` (пустое значение)                       | любой        |
| `parcelForceZone` | `Zone 1`, `Zone 2`, `Zone 3`, `none` (пустое значение)        | любой        |

Пример: `GET /api/postcodes?postcode=M4&calendar=Odd&parcelForceZone=Zone%201`.

- `GET /api/postcodes/:id` отдаёт и неактивную запись.
- POST и PUT принимают только `Content-Type: application/json`.
- DELETE мягкий (`active=false`). Вернуть запись: `PUT` с `{ "active": true }`.
- Ответ с одной записью: документ с полями ниже, плюс `_id`, `createdAt`, `updatedAt`.

### Тело POST и PUT

Все значения строки, кроме `active`. В POST обязательны `postcode`, `town`, `country`. PUT частичный, нужно хотя бы одно поле. Неизвестные поля отбрасываются.

| Поле                | Правило                                               |
| ------------------- | ----------------------------------------------------- |
| `postcode`          | непустая, приводится к верхнему регистру, уникальна   |
| `town`              | непустая                                              |
| `country`           | непустая (`ENG`, `SCT`, `WLS`, `NIR`, ...)            |
| `region`            | любая                                                 |
| `countryString`     | любая                                                 |
| `basicPrice`        | любая                                                 |
| `additionalCharges` | любая                                                 |
| `parcelForceZone`   | `""`, `Zone 1`, `Zone 2`, `Zone 3`                    |
| `discount`          | `""` или число от 0 до 100, дробная часть через точку |
| `calendar`          | `""`, `Odd`, `Even`                                   |
| `active`            | boolean, по умолчанию `true`                          |

### Массовое изменение: `PUT /api/postcodes/bulk`

Одно и то же изменение для многих записей. Тело:

```json
{ "ids": ["6ac9a9213a671434070832bd"], "changes": { "calendar": "Odd" } }
```

- `ids`: от 1 до 5000 id, дубли убираются.
- `changes`: хотя бы одно из полей `calendar`, `parcelForceZone`, `discount`, `active` с теми же правилами, что в таблице выше. Другие поля дают 400.
- Ответ: `{ "matched": 120, "modified": 118, "notFound": [] }`. `matched` найдено, `modified` реально изменилось, `notFound` id, которых нет в базе.
- Каждая запись меняется целиком или не меняется; отката между записями нет.

### CSV: экспорт и импорт

В CMS: кнопки **Export CSV** и **Import CSV** над таблицей.

- `GET /api/postcodes/export` отдаёт файл `postcodes-YYYY-MM-DD.csv` со всеми записями (активными и нет). UTF-8 с BOM, разделитель запятая, колонки: `postcode, town, region, country, countryString, basicPrice, additionalCharges, parcelForceZone, discount, calendar, active` (`true`/`false`).
- Импорт идёт через страницу `/postcodes/import`:
  - файл читается в браузере (до 5 МБ и 10000 строк, разделитель `,` или `;`, заголовки без учёта регистра);
  - обязательные колонки `postcode`, `town`, `country`; колонки, которых нет в файле, сохраняют текущие значения; неизвестные колонки игнорируются;
  - предпросмотр показывает статус каждой строки (New, Update, Unchanged, Error), изменённые ячейки подсвечены. Строки можно править и исключать, Import доступен, когда ошибок нет;
  - пустой `town` допустим у существующего postcode, у нового обязателен; `discount` с запятой (`7,5`) превращается в `7.5`; `active` понимает `true/false`, `yes/no`, `1/0`.
- `POST /api/postcodes/import` принимает `{ "rows": [{ "postcode": "...", ..., "active": "true" }] }` (все колонки строками), проверяет все строки и пишет одной транзакцией: либо всё, либо ничего. Ответ: `{ "inserted", "updated", "unchanged" }`. При ошибках 400 с `details.rows: [{ "index", "errors" }]`.
- Существующие записи ищутся по `postcode`; записи, которых нет в файле, не меняются и не удаляются.

### Ошибки

Формат: `{ "error": "...", "details": {...} }` (`details` у 400 и у 409 импорта цен).

| Код | Когда                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 | ошибка валидации                                                                                                                                   |
| 401 | нет сессии                                                                                                                                         |
| 403 | нет роли admin                                                                                                                                     |
| 404 | запись не найдена или невалидный id                                                                                                                |
| 409 | `postcode` уже существует (в том числе среди неактивных записей); цены или сборы изменились после чтения (`updatedAt` в PUT, `from` в импорте цен) |
| 415 | Content-Type не `application/json`                                                                                                                 |
| 503 | база недоступна                                                                                                                                    |
| 500 | прочие ошибки                                                                                                                                      |

CORS: публичные GET отдают `Access-Control-Allow-Origin` только для origin из `CORS_ORIGINS`. Запись через CORS не разрешена.

## Цены

Раздел **Prices**: цены на перевозку, которые читает сайт ecotrip-react. Источник — Google-таблица «Ecotrip pricelist» (лист «Visos kategorijos»). Дизайн: `docs/superpowers/specs/2026-10-11-prices-design.md`.

### Структура

Коллекция `pricecategories`, один документ на категорию (типы в `lib/price-types.ts`). У категории либо подкатегории (`subCategories`), либо своя цена (`pricing`). Цена бывает трёх видов:

- `fixed`: варианты с размером и спецификацией; у каждого цена, объём и вес;
- `measured`: ступени по весу и/или объёму (`upTo` включительно, `null` только у последней); если заданы обе базы, берётся большая цена;
- `callManager`: цены нет, сайт предлагает связаться с менеджером.

Цены по направлениям: `UK-LT` в £, `LT-UK` в €. `value` у опций не меняется (его хранят заказы), `label` — ключ i18n сайта или литерал (`<R18`). Поле `sheet` хранит тексты строки таблицы, по ним работает импорт.

### Наполнение

- `npx tsx scripts/generate-price-catalog.ts "<путь к CSV>"` пересобирает `scripts/data/price-catalog.json`. Нужно только при изменении структуры (соответствие текстов таблицы и слагов сайта задано в скрипте).
- `npm run import:prices` — сухой прогон, `npm run import:prices -- --write` — вставить категории, которых нет в базе. Существующие не меняются.

### Обновление цен

**Prices → Import CSV**: в Google Sheets File → Download → Comma-separated values (.csv), затем выбрать файл. Превью показывает изменения (галочки можно снять), строки, которых нет в CMS, строки CMS, которых нет в файле, и нечитаемые ячейки. Изменения, которые очищают значение или относятся к строке с ошибкой, по умолчанию не отмечены. **Apply** применяет выбранное одной транзакцией. Если цены изменились после открытия превью, ответ 409, файл нужно выбрать заново.

Импорт меняет только цены, объём и вес существующих строк. Новую позицию (тип, размер) он не создаёт: ей нужны переводы на сайте. Новую категорию добавляют в `price-catalog.json` и вставляют `import:prices`; новую строку в существующей категории — через `PUT /api/prices/:category`.

### Экспорт

**Prices → Export JSON** скачивает `prices-<дата>.json` — весь каталог в том же виде, что `GET /api/prices` (`{ categories }`). Им обновляют резервный снимок цен на сайте.

### API цен

| Метод | Путь                    | Доступ    |
| ----- | ----------------------- | --------- |
| GET   | `/api/prices`           | публичный |
| PUT   | `/api/prices/:category` | admin     |
| POST  | `/api/prices/import`    | admin     |
| GET   | `/api/prices/export`    | admin     |

- `GET /api/prices` → `{ categories }`, сортировка по `order`. CORS как у postcodes (`CORS_ORIGINS`).
- `PUT /api/prices/:category` принимает `{ category, updatedAt }`: категорию целиком и `updatedAt`, который клиент прочитал. Если категория с тех пор изменилась, 409. `value` менять нельзя (400), неизвестная категория — 404.
- `POST /api/prices/import` принимает `{ changes: [{ category, sheet, field, from, to }] }`, до 1000 изменений. `field`: `price.UK-LT`, `price.LT-UK`, `volume`, `weight`. Если хоть одно `from` не совпадает с текущим значением, 409 с `details.conflicts`, ничего не пишется.

## Сборы и скидки

Раздел **Fees**: сборы за услуги, надбавки ParcelForce и скидки за количество посылок, которые сайт ecotrip-react добавляет к заказу (низ таблицы цен: «Paslaugų įkainiai», «NUOLAIDOS»). Каждое поле на странице объясняет, что оно делает, с примером. Дизайн: `docs/superpowers/specs/2026-10-11-fees-design.md`.

### Структура

Коллекция `feesettings`, один документ (типы в `lib/fee-types.ts`, копия на сайте в `src/utils/orderFees.ts`, менять вместе). Каждая сумма — одно число, на сайте это £ или € по направлению.

- `addressService.fee`: сбор за услугу адреса, один раз на заказ;
- `purchaseService`: покупка товара для клиента. Если сумма товаров меньше `threshold`, сбор `ownMoney` и цена товаров добавляется к заказу, иначе сбор `clientMoney`;
- `salesService`: продажа товара клиента;
- `parcelForce`: надбавка к каждой посылке услуги ParcelForce: маленькая посылка (`small`), средняя по ступеням веса (`medium.tiers`), иначе по зоне postcode (`zones`, ровно `Zone 1`, `Zone 2`, `Zone 3` по порядку);
- `quantityDiscounts`: скидка на заказ по числу посылок, `fromParcels` по возрастанию, первая строка с 1. Если у postcode своя скидка, берётся большая.

Сбор в процентах (`ownMoney`, `clientMoney`, `salesService`): `percent` от 0 до 100, `min` и `max` — границы или `null` (без границы), `min` не больше `max`.

### Наполнение

- Начальные значения в `scripts/data/fee-settings.ts`.
- `npm run import:fees` — сухой прогон: проверяет значения и показывает, есть ли документ в базе. `npm run import:fees -- --write` вставляет документ, только если его нет. Существующий не меняется.

Пока документа нет, `GET /api/fees` отвечает 404, а страница **Fees** предлагает выполнить импорт.

### Изменение

На странице **Fees** изменения копятся до **Save**: изменённые поля подсвечены, счётчик Unsaved, при уходе со страницы браузер предупреждает. Ошибки показываются под полем, Save недоступен, пока они есть. Если сборы изменились после открытия страницы (другая вкладка), ответ 409, изменения на странице остаются.

### API сборов

| Метод | Путь        | Доступ    |
| ----- | ----------- | --------- |
| GET   | `/api/fees` | публичный |
| PUT   | `/api/fees` | admin     |

- `GET /api/fees` → документ целиком (`_id`, `createdAt`, `updatedAt` и поля выше). 404, если документа нет. CORS как у postcodes (`CORS_ORIGINS`).
- `PUT /api/fees` принимает `{ settings, updatedAt }`: все сборы целиком и `updatedAt`, который клиент прочитал. Неизвестные поля дают 400. Если документ изменился с тех пор, 409; если документа нет, 404. Ответ: сохранённый документ.

## Журнал изменений

Раздел **Change log**: каждое сохранение в Postcodes, Prices и Fees — кто (username в Clerk, иначе email), когда, на какой странице и что изменилось. Одна запись = одно сохранение: правка или удаление postcode, массовое изменение, импорт CSV, Save категории цен или сборов. Запись раскрывается в список полей «было → стало».

- Хранятся последние 500 записей (коллекция `changelogs`), более старые удаляются при каждой новой записи. В одной записи сохраняется до 1000 изменённых полей; если их больше (крупный импорт), видно общее число.
- Сохранение, которое ничего не изменило, не записывается. Скрипты `import:*` не записываются.
- Запись в журнал не влияет на результат сохранения: если она не удалась, ошибка пишется в лог сервера.

| Метод | Путь             | Доступ |
| ----- | ---------------- | ------ |
| GET   | `/api/changelog` | admin  |

`GET /api/changelog?page=1&limit=20` → `{ items, total, page, limit }`, новые сверху, `limit` до 100.

## Скрипты

| Команда                                  | Что делает                                                       |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                            | dev-сервер                                                       |
| `npm run build`, `npm start`             | production-сборка и запуск                                       |
| `npm run lint`                           | ESLint                                                           |
| `npm run typecheck`                      | проверка TypeScript                                              |
| `npm test`                               | unit-тесты (vitest)                                              |
| `npm run format`, `npm run format:check` | Prettier                                                         |
| `npm run import:postcodes`               | сухой прогон импорта из `scripts/data/ukPostCodesv2.ts`          |
| `npm run import:postcodes -- --write`    | импорт в базу: только новые `postcode`, существующие не трогает  |
| `npm run import:prices`                  | сухой прогон наполнения цен из `scripts/data/price-catalog.json` |
| `npm run import:prices -- --write`       | вставить в базу категории цен, которых там нет                   |
| `npm run import:fees`                    | сухой прогон наполнения сборов из `scripts/data/fee-settings.ts` |
| `npm run import:fees -- --write`         | вставить в базу документ сборов, если его там нет                |

## Деплой

- Node 24.
- Переменные окружения из таблицы выше в настройках хостинга.
- MongoDB Atlas:
  - Network Access: разрешить IP хостинга. Для serverless без фиксированных IP: `0.0.0.0/0` или интеграция хостинга с Atlas.
  - Пользователь базы с правом `readWrite` только на базу `ecotrip`.
  - Unique-индекс на `postcode` должен существовать (его создают скрипт импорта и Mongoose при первом подключении).
- Clerk production-инстанс: свои ключи, Username и Password, sign-up mode Restricted, пользователи с ролью admin.
- `CORS_ORIGINS`: production-домены сайтов, которые читают API из браузера.

## Заметки по коду

- В Next.js 16 `middleware.ts` называется `proxy.ts`. Он только подключает сессию Clerk. Проверки доступа живут рядом с ресурсом: страницы вызывают `requireAdminPage()`, Route Handlers на запись вызывают `requireAdmin()`. **Новая страница CMS обязана вызвать `requireAdminPage()`.**
- Удалённые записи (`active=false`) видны через публичный API намеренно.
