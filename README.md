# fetch-url Extension for pi

Расширение для [pi coding agent](https://github.com/mariozechner/pi-coding-agent), которое позволяет читать содержимое веб-страниц.

## Возможности

- ✅ Загрузка HTTP/HTTPS страниц
- ✅ Автоматическое определение формата (HTML, JSON, текст)
- ✅ Извлечение метаданных (title, description, OG tags)
- ✅ Извлечение структуры заголовков (h1-h6)
- ✅ Извлечение всех ссылок со страницы
- ✅ Таймаут 30 секунд
- ✅ Автоматическая обрезка контента до 50KB

## Установка

### Вариант 1: Git clone + symlink

```bash
# Клонировать репозиторий
git clone https://github.com/Prontsevich/pi-fetch-url-extension.git ~/.pi/agent/extensions/fetch-url

# Перезагрузить pi или выполнить /reload
```

### Вариант 2: Ручное копирование

```bash
# Скопировать index.ts в папку расширений
cp index.ts ~/.pi/agent/extensions/fetch-url/

# Перезагрузить pi или выполнить /reload
```

## Использование

### Базовое использование

```
Прочитай https://example.com
```

### Параметры

| Параметр | Значения | По умолчанию | Описание |
|----------|----------|--------------|----------|
| `format` | `auto`, `text`, `json`, `raw` | `auto` | Формат ответа |
| `extract` | `metadata`, `links`, `headings`, `all`, `none` | `all` | Что извлекать из HTML |

### Примеры

```
# Прочитать страницу с извлечением всех данных
Прочитай https://wikipedia.org/wiki/Cat

# Только метаданные
Прочитай https://example.com с extract=metadata

# Только ссылки
Прочитай https://news.ycombinator.com с extract=links

# JSON API
Прочитай https://api.github.com/repos/Prontsevich/pi-fetch-url-extension с format=json
```

## Вывод

В чат выводится только статус запроса:
```
✅ https://example.com
```

Все данные (метаданные, заголовки, ссылки, контент) доступны агенту для обработки.

## Технические детали

- **Входной файл:** `index.ts`
- **Точка входа:** `export default function(pi: ExtensionAPI)`
- **Зависимости:** `@sinclair/typebox`, `@mariozechner/pi-ai`
- **Совместимость:** pi coding agent v0.65+

## Лицензия

MIT License — см. файл [LICENSE](LICENSE)
