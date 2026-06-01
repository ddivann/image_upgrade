# Image Enhancer

Браузерная библиотека для автоматического улучшения изображений (яркость, контраст, насыщенность) с использованием WebGL и ML. Вся обработка происходит локально на устройстве пользователя.

## Возможности

- Асинхронная обработка через Web Worker (без блокировки UI)
- GPU-ускорение через WebGL шейдеры
- Поддержка форматов: JPG, PNG, HEIC, BMP
- Автоматический подбор параметров улучшения
- REST-like API для управления задачами

## Быстрый старт

```bash
npm install
npm run dev      # Запуск демо-страницы
npm run build    # Сборка production-бандла
```

## API

```javascript
import { ImageEnhancer } from 'image-enhancer';

const enhancer = new ImageEnhancer();

// Подписка на прогресс
enhancer.onTaskStatusChange((progress) => {
    console.log(`${progress.status}: ${progress.progress}%`);
});

// Обработка изображения
const taskId = await enhancer.submitTask(file);
const result = await enhancer.getResult(taskId);

// Отмена задачи
await enhancer.cancelTask(taskId);
```

## Методы

| Метод | Описание |
|-------|----------|
| `submitTask(image)` | Постановка задачи, возвращает taskId |
| `getTaskStatus(taskId)` | Получение статуса и прогресса |
| `cancelTask(taskId)` | Отмена выполнения |
| `getResult(taskId)` | Получение результата (Blob) |
| `onTaskStatusChange(callback)` | Подписка на обновления |

## Характеристики

| Параметр | Значение |
|----------|----------|
| Размер бандла | ~1.8 МБ |
| Макс. разрешение | 15 Мп |
| Таймаут | 30 сек |
| Среднее время | 2-3 сек (15 Мп) |

## Браузеры

Chrome 90+, Firefox 90+, Safari 15+, Edge 90+, iOS Safari 15.4+

## Структура

```
src/
├── api/          # Public API
├── decoders/     # Декодирование изображений
├── ml/           # ML-инференс (ONNX / эвристика)
├── processing/   # WebGL-обработка
├── utils/        # Кодирование, утилиты
└── worker/       # Web Worker pipeline
```

## Кастомизация ML

Для использования собственной ONNX-модели:
1. Поместите `model.onnx` в public-директорию
2. Установите `VITE_ENABLE_ONNX=true`

Без модели используется встроенная эвристика на основе статистики изображения.

## Лицензия

MIT