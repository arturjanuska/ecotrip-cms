# Раздел «Цены» в Ecotrip CMS

Дата: 2026-10-11. Статус: дизайн согласован в чате, ждёт ревью спека.

## Цель

Цены на перевозку сейчас захардкожены в ecotrip-react (`src/utils/products.ts`, 3374 строки, плюс формулы в `calculateShipmentPrice.ts`). Источник цен — Google-таблица «Ecotrip pricelist» (лист «Visos kategorijos», версия от 2026-09-17). Когда цены меняются, присылают обновлённую таблицу, и её переносят в код вручную.

Задача: хранить цены в Ecotrip CMS в структуре, которая повторяет таблицу, обновлять их импортом CSV этой таблицы и отдавать сайту через публичный API в виде, готовом для каскада Select (Category → Sub Category → Size → Specification).

Успех:
- обновлённая таблица применяется в CMS за несколько кликов, без правки кода;
- сайт берёт цены из CMS, `products.ts` удалён;
- все цены сайта совпадают с таблицей.

## Принятые решения

| Вопрос | Решение |
| --- | --- |
| `label` у опций | ключ i18n (переводы остаются в json ecotrip-react) или литерал (`<R18`, `<1000 cm3`) |
| `value` у опций | нынешний слаг сайта, неизменяемый: формат заказа не меняется |
| Формульные цены (посылки, переезды, холодильники) | в CMS, описываются ступенями |
| Валюта | цена на каждое направление: `UK-LT` (£) и `LT-UK` (€) |
| LT-LT | не делаем, колонка таблицы игнорируется |
| Сборы уровня заказа (`getOrderPrice.ts`: ParcelForce, скидки, комиссии сервисов) | отдельный этап позже |
| Хранение | один документ Mongo на категорию |
| Источник правды | таблица; первичное наполнение строится по ней, а не по `products.ts` |
| CMS недоступна для сайта | резервный снимок каталога в бандле, обновляется при каждой сборке |

## Сверка таблицы и `products.ts`

Все 159 табличных цен совпадают, кроме перечисленного ниже. Цены GBP и EUR сейчас везде равны. Наполнение CMS берёт данные из таблицы с такими правками:

| Где | `products.ts` | Таблица | В CMS |
| --- | --- | --- | --- |
| `cover / minibuses`, цена | 890 | 90 | 90 |
| `stove`, вторая строка `built-in` | дубль ключа, цена на сайте всегда 0 | «Pastatoma», 80 | новый ключ `freestanding`, 80 |
| `gearbox` до 3000 cm³, объём и вес | механика и автомат перепутаны | верно | по таблице |
| `gearbox`, Mechaninė <2000 и Automatinė <2500, объём | — | 0.4 (опечатка) | 0.04 |
| `strollers / umbrella`, объём | 0.8 | 0.08 | 0.08 |
| малый садовый трактор без мешка, объём | 0.7 | 0.8 | 0.8 |
| `engine` 0–999, подпись | `>1000 cm3` | `<1000 cm3` | `<1000 cm3` |
| `setOfWheels`, подписи | `R16 - R18`, `R19 - R22` при диапазонах 16–17 и 18–21 | `<R18`, `<R22` | подписи из таблицы |
| чоппер, третий размер | `>1200` | «1200 cm3» (опечатка) | ключ таблицы «1200 cm3», подпись `>1200 cm3` |
| `removals`, ступени за м³ | 200 / 170 / 150 / 130 / 115 (не используются), в коде 200 / 185 / 170 / 150 / 130 / 115 | 200 / 185 / 170 / 160 / 150 / 130 / 115 | по таблице, 7 ступеней |

Новый ключ i18n `freestanding`: en «Freestanding», lt «Pastatoma», ru «Отдельностоящая».

Что из таблицы не переносится:
- детский велоприцеп в «Prekės vaikams» (остаётся только в `bicyclesAndScooters`, как на сайте);
- строка «Kita» (это инструкция для менеджеров);
- колонка «Kaina LT-LT»;
- блоки «Paslaugų įkainiai» и «NUOLAIDOS» (этап `getOrderPrice`).

## Модель данных

Файл `lib/price-types.ts` в CMS. Копия в ecotrip-react (`src/utils/priceCatalog.ts`) держится в синхроне вручную, в обоих файлах есть комментарий об этом.

```ts
export type Direction = "UK-LT" | "LT-UK"; // £ и €
export type Money = Record<Direction, number>;

// Опция для Select: { value, label }.
export type Node = { value: string; label: string };

// Точный текст строки таблицы. Ключ сопоставления при импорте и текст колонок в CMS.
export type SheetKey = { type: string; size: string; spec: string };

export type Variant = {
  sheet: SheetKey;
  size: Node | null;
  specification: Node | null;
  volume: number | null; // м³ одной штуки, информация для логистики
  weight: number | null; // кг одной штуки
  price: Money;
};

export type Tier = {
  sheet: SheetKey;
  upTo: number | null; // включительно; null только у последней ступени
  price: Money;
  perUnit: boolean; // true: цена за кг или м³, false: цена за посылку
};

export type Pricing =
  | { type: "fixed"; variants: Variant[] }
  | { type: "measured"; byWeight: Tier[] | null; byVolume: Tier[] | null }
  | { type: "callManager" };

export type SubCategory = Node & { pricing: Pricing };

export type Category = Node & {
  sheet: string; // текст колонки «Siuntos kategorija»
  order: number;
  subCategories: SubCategory[]; // порядок массива = порядок в Select
  pricing: Pricing | null; // задан тогда и только тогда, когда subCategories пуст
};
```

Mongo: модель `PriceCategory`, коллекция `pricecategories`, 10 документов, unique-индекс на `value`, `timestamps: true`, `versionKey: false`.

### Правила целостности (Zod, `lib/validation/price.ts`)

- `value` категорий уникален; `value` подкатегорий уникален внутри категории.
- `pricing` задан ровно тогда, когда `subCategories` пуст.
- В `fixed`: хотя бы один вариант; пара `size.value` + `specification.value` уникальна; цены > 0 по обоим направлениям; `volume` и `weight` ≥ 0 или `null`.
- В `measured`: задан хотя бы один из `byWeight` и `byVolume`; ступени идут по возрастанию `upTo`; `upTo: null` только у последней; цены > 0.
- Нормализованный `SheetKey` (trim, схлопнутые пробелы, нижний регистр) уникален внутри категории среди вариантов и ступеней.

### Подписи размеров

- Размеры-опции (`microCars`, `fullyAssembled`, `umbrella`, …) сохраняют нынешние слаги и ключи i18n. У стиральных машин исправляется перевёрнутость: `value` и `label` = `smallWashingMachine` и т. д.
- Размеры-диапазоны получают `value` = `label` = текст таблицы, переведённый в литерал: `<R16`, `<R18`, `<R22`, `>R22`; `<1000 cm3` … `>4000 cm3`; `<24 inch` … `>85 inch` (вместо «coliai»); `<25 km/h`, `>25 km/h`; `<50 cm3`, `<125 cm3`, …; садовые трактора `<80 cm`, `<120 cm`, `>120 cm`.
- Газонокосилки остаются отдельными подкатегориями без размера (`size: null`); текст «Pjovimo skersmuo <45 cm» живёт только в `sheet`.

### Как категории ложатся на модель

Порядок категорий (`order`) повторяет таблицу.

| Категория | Подкатегории | `pricing` |
| --- | --- | --- |
| `shipments` (`sheet`: «Siuntos») | нет | `measured`: по весу `<1kg` 35, `<15 kg` 45, `<30 kg` 50 за посылку, `>30 kg` 1.65 за кг; по объёму `<0.16` 230, `<0.31` 220, `<0.47` 210, `<0.63` 205, `0.63+` 200 за м³ |
| `automotiveGoods` | `setOfWheels`, `doors`, `bumper`, `cover`, `engine`, `gearbox` — `fixed`; `interior`, `carQuarter` — `callManager` | — |
| `householdAppliances` | `fridge`, `freezer` — `measured`, одна ступень 200 за м³; остальные `fixed` | — |
| `bicyclesAndScooters` | все `fixed` | — |
| `motorcyclesAndAccessories` | все `fixed` | — |
| `palettes` | нет | `callManager` |
| `removals` | нет | `measured` по объёму: ≤1 200, ≤2 185, ≤3 170, ≤4 160, ≤5 150, ≤10 130, свыше 115 за м³ |
| `flatScreenTv` | нет | `fixed`, 11 размеров |
| `goodsForChildren` | все `fixed` | — |
| `gardenEquipment` | все `fixed` | — |

### Расчёт цены

- `fixed`: `variant.price[direction] × amount`.
- `measured`: для каждой заданной базы находится первая ступень с `value ≤ upTo` (иначе последняя). Если `perUnit`, цена = ставка × значение, иначе цена = ставка. Итог = max по базам × amount. Если для заданной базы не хватает входных данных (вес или три габарита), цена 0. Вес 0 даёт 0. Это повторяет нынешнее поведение `calculateShipmentPrice` и `calculateVolume`.
- `callManager`: цены нет, сайт показывает сообщение менеджера.

## Первичное наполнение

- `scripts/data/price-catalog.ts`: готовый `Category[]` со всеми правками из раздела сверки. Генерируется один раз из CSV и слагов `products.ts`, ревьюится как обычный diff.
- `npm run import:prices`: сухой прогон (Zod-проверка, список категорий к вставке). `npm run import:prices -- --write`: вставляет только отсутствующие категории, существующие не трогает.

## API

Паттерны как у postcodes: `withErrorHandling`, CORS через `CORS_ORIGINS`, запись только admin (`requireAdmin`) и только JSON (`requireJson`), Zod на входе.

| Метод | Путь | Доступ | Что делает |
| --- | --- | --- | --- |
| GET | `/api/prices` | публичный | `{ categories: Category[] }`, сортировка по `order`, с `_id` и `updatedAt` |
| PUT | `/api/prices/:category` | admin | заменяет документ категории целиком |
| POST | `/api/prices/import` | admin | применяет выбранные изменения из CSV |

`PUT /api/prices/:category`
- Тело: `{ category: Category, updatedAt: string }`. `category.value` должен совпадать с `:category`, иначе 400.
- Защита от перезаписи: обновление идёт с фильтром `{ value, updatedAt }`. Если документ уже изменён, ответ 409.
- Ответ: обновлённый документ.

`POST /api/prices/import`
- Тело: `{ changes: Change[] }`, от 1 до 1000 элементов.
  ```ts
  type Change = {
    category: string; // value категории
    sheet: SheetKey; // строка таблицы: вариант или ступень
    field: "price.UK-LT" | "price.LT-UK" | "volume" | "weight";
    from: number | null; // значение, которое видел клиент
    to: number | null;
  };
  ```
- Логика в чистой функции `applyImportChanges(categories, changes)` (`lib/price-import.ts`): находит цель по нормализованному `SheetKey`, сверяет `from` с текущим значением, применяет `to`. Несовпадение `from` или ненайденная цель = конфликт, ничего не пишется, ответ 409 со списком конфликтов.
- Изменённые документы проходят Zod и пишутся одной транзакцией.
- Ответ: `{ updated: number }` (сколько полей изменено).

Не входит в v1: создание и удаление категорий через API (делает скрипт наполнения).

Ошибки в формате postcodes: 400 / 401 / 403 / 404 (нет категории) / 409 (данные устарели или конфликт импорта) / 415 / 503 / 500.

## UI в CMS

Пункт sidebar «Prices». Интерфейс на английском, как остальная CMS. Каждая страница вызывает `requireAdminPage()`.

`/prices`
- Одна таблица на всю страницу, колонки как в таблице цен: Category, Type, Size, Specification, Volume (m³), Weight (kg), UK→LT (£), LT→UK (€). Первые четыре колонки показывают тексты `sheet`.
- Категории идут блоками по `order`, у каждого блока кнопка «Save» (PUT категории).
- Редактируются только числа: две цены, `volume`, `weight` у вариантов; две цены и `upTo` у ступеней. У цены за единицу суффикс «/kg» или «/m³».
- Правки копятся черновиками, как в `postcodes-table`: изменённые ячейки подсвечены, счётчик «Unsaved: N», предупреждение `beforeunload`. Ошибки Zod у ячейки, Save заблокирован, пока они есть.
- Строки `callManager` серые, с текстом «Contact manager», без полей.
- Ответ 409 на Save: сообщение «Prices changed elsewhere, reload», черновик не теряется до перезагрузки.

`/prices/import`
1. Выбор CSV (до 1 МБ). Разбор в браузере через papaparse.
2. Превью:
   - **Changes**: строка таблицы, поле, старое → новое, галочка (по умолчанию включена);
   - **Unknown rows**: строки таблицы, которых нет в CMS (не применяются);
   - **Missing rows**: варианты и ступени CMS, которых нет в таблице (ничего не удаляется);
   - **Errors**: нечитаемые значения.
3. «Apply N changes» → `POST /api/prices/import` → возврат на `/prices` с итогом. На 409 превью предлагает загрузить файл заново.

Не входит в v1: добавление и удаление строк через UI, экспорт CSV, черновик и публикация прайса.

## Разбор CSV (`lib/price-sheet.ts`)

Чистые функции `parsePriceSheet(text)` и `diffPriceSheet(categories, rows)`, общие для браузера и тестов.

- Шапка: строка, где есть ячейка «Siuntos kategorija». Колонки ищутся по нормализованному тексту шапки: «Siuntos kategorija», «Siuntos tipas», «Dydis», «Dydžio patikslinimas», «Tūris», «Svoris», колонка с «GBP» (`UK-LT`), колонка с «EUR» (`LT-UK`). Колонка «LT-LT» игнорируется.
- Строки до первой непустой ячейки категории относятся к категории «Siuntos». Строка «arba» отделяет ступени по весу от ступеней по объёму.
- Пустые ячейки категории и типа заполняются значением сверху; новая категория сбрасывает тип.
- Числа: запятая как десятичный разделитель (`1,65` → 1.65); хвосты единиц отбрасываются (`230 m3`, `1,65 gbp/kg`, `1,65 eur/kg`).
- Пропускаются: пустые строки; строки «Susisiekti su vadybininku»; строка «arba»; «Kita»; велоприцеп в «Prekės vaikams»; всё начиная со строки «Paslaugų įkainiai».
- Сопоставление: (`category.sheet`, `type`, `size`, `spec`) после нормализации. Для ступеней сравниваются только цены; для вариантов цены, `volume`, `weight`. Нечисловые ячейки объёма и веса у формульных строк («skaičiuojama pagal m3») игнорируются.
- Изменение границы ступени в таблице (например, «<4 m3» → «<4.5 m3») даёт Unknown row плюс Missing row; границу правят в `/prices`.

## Интеграция в ecotrip-react

Загрузка
- Переменная `VITE_CMS_URL`. Функция `getPriceCatalog()` делает `GET {VITE_CMS_URL}/api/prices`.
- Хук `usePriceCatalog()` на `@tanstack/react-query` (провайдер уже есть в `App.tsx`), `staleTime` 5 минут.
- Домен сайта добавляется в `CORS_ORIGINS` CMS.

Резервный снимок
- `src/data/priceCatalog.snapshot.json` в репозитории.
- Скрипт `prebuild` скачивает каталог из CMS и перезаписывает снимок. Если CMS недоступна, сборка не падает: остаётся прежний снимок, в лог пишется предупреждение.
- Снимок передаётся как `placeholderData`: форма рисуется сразу, после ответа CMS цены пересчитываются. При ошибке запроса форма работает на снимке, в консоль `console.warn`.
- Известный риск: если цены изменили в CMS, сайт не пересобран, а CMS недоступна, клиент увидит старую цену.

Модуль `src/utils/priceCatalog.ts` (без React)
- Типы (копия `lib/price-types.ts`).
- `categoryOptions`, `subCategoryOptions` (пусто → Sub Category скрыт), `sizeOptions` и `specificationOptions` (одна опция → выбирается молча, select скрыт), `findVariant`, `calculatePrice(pricing, input, direction)`.
- Направление для цены = то же выражение, что `route` в `transformFormDataToEndpoint.ts`: `shipmentWithAddressService` → `UK-LT`, иначе `direction`.

Изменения в форме (`SingleShimpentForm.tsx`, `useCalculatePrice.ts`, селекты step2)
- `categoriesWithProductType` → `subCategories.length > 0`.
- Особый случай `flatScreenTv` для Size → общий Size select.
- `productTypesWithRequiredManagerCall` → `pricing.type === "callManager"`.
- `productTypesThatNeedsPriceCalculation` → `pricing.type === "measured"` у подкатегории.
- Ветки UI по слагам `shipments` и `removals` и логика ParcelForce (`extent`, лимиты) остаются.

Удаляется: `products.ts`, `convertSizeOptions.ts`, `getOptions.ts`, `shipmentsExlusions.ts`, ставки в `calculateShipmentPrice.ts` (формула `extent` остаётся), неиспользуемые enum в `types.ts`.

Совместимость: формат заказа не меняется. У размеров-диапазонов новые строки `value`; старые заказы хранят старые строки. В en/lt/ru добавляется ключ `freestanding`.

## Тесты

CMS (vitest):
- `lib/validation/price.test.ts`: отказ на повтор `size`+`specification`, цену 0 или пустую, ступени не по порядку, `upTo: null` не в конце, `pricing` вместе с `subCategories`, повтор `SheetKey`.
- `lib/price-sheet.test.ts` с фикстурой — копией таблицы от 2026-09-17:
  - разбор чисел, заполнение сверху, блок «Siuntos», «arba», пропуски;
  - diff исходной таблицы с `price-catalog.ts` даёт ровно два изменения (опечатки `gearbox` 0.04 → 0.4), ноль Unknown rows и ноль Missing rows;
  - изменённая цена даёт одно изменение, новая строка попадает в Unknown rows.
- `lib/price-import.test.ts`: применение изменений, конфликт по `from`, ненайденная цель.
- `price-catalog.ts` целиком проходит Zod.

ecotrip-react (добавить vitest в devDependencies и скрипт `test`):
- `priceCatalog.test.ts`: каскад опций, автовыбор единственной опции, `findVariant`, `calculatePrice` для `fixed`, `measured`, `callManager`; формула посылок на входах 0, 1, 15, 31 кг и на границах ступеней объёма даёт те же числа, что старая `calculateShipmentPrice`.

Разовая сверка при внедрении: каждая строка старого `products.ts` прогоняется через новый `calculatePrice`; расхождения допустимы только для `minibuses` и `stove/freestanding`. Результат показывается до удаления `products.ts`.

Вручную: сайт против локальной CMS, каждая категория в браузере; затем CMS останавливается и проверяется работа на снимке.

## Порядок внедрения

1. CMS: типы, Zod, модель, `price-catalog.ts`, скрипт наполнения, `GET /api/prices`.
2. CMS: `PUT /api/prices/:category` и страница `/prices`.
3. CMS: разбор CSV, `POST /api/prices/import` и страница `/prices/import`.
4. ecotrip-react: `priceCatalog.ts` с тестами, хук, снимок и `prebuild`, переключение формы, сверка, удаление старых файлов, ключ `freestanding`.
5. README CMS: раздел про цены, API и импорт.

## Вне рамок

- Сборы уровня заказа из `getOrderPrice.ts` — следующий этап.
- LT-LT.
- Добавление и удаление строк через UI CMS, экспорт CSV, черновик и публикация.
- Ключ `app_id` openexchangerates в клиентском коде (`hooks/useCurrencyConverter.ts`) — отдельная задача по безопасности.
- Перевод postcodes сайта на API CMS.
