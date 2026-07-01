# LOOKTURA — лендинг

Статический сайт LOOKTURA (агрегатор офлайн-магазинов одежды, Москва).

## Страницы

| Файл | Назначение |
|------|------------|
| `index.html` | Главная — 3D-карусель приложения (`phone.js`) |
| `partners.html` | Для магазинов («партнёрам») — 3D scroll-story (`diorama.js`) |
| `privacy.html` | Политика конфиденциальности |

## Технологии

Чистый HTML/CSS/JS, ES-модули через importmap. 3D — [Three.js](https://threejs.org/) r0.160 с CDN. Внешних зависимостей для сборки нет, кроме инструментов минификации.

## Запуск локально

```bash
python3 -m http.server 4599
# открыть http://localhost:4599
```

## Сборка (минификация в dist/)

```bash
bash build.sh
# готовый сайт — в папке dist/
```

`build.sh` копирует и минифицирует HTML/CSS/JS в `dist/`, добавляет `.nojekyll` для GitHub Pages.

## Публикация

Сайт — статический, публикуется на **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root). Файл `.nojekyll` в корне отключает обработку Jekyll.

Контакт: andrei.khitrov34@gmail.com
