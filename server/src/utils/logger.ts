import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Кастомный формат для логов
const customFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Добавляем stack trace для ошибок
  if (stack) {
    msg += `\n${stack}`;
  }

  // Добавляем дополнительные метаданные, если есть
  if (Object.keys(metadata).length > 0) {
    msg += `\n${JSON.stringify(metadata, null, 2)}`;
  }

  return msg;
});

// Определяем уровень логирования в зависимости от окружения
const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Создаем логгер
const logger = winston.createLogger({
  level,
  format: combine(
    errors({ stack: true }), // Обрабатываем stack trace
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    // Логи ошибок в отдельный файл
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Все логи в combined.log
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Обработка необработанных исключений и отклонений промисов
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'rejections.log'),
    }),
  ],
});

// В development режиме также выводим в консоль с цветами
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      ),
    })
  );
}

// Stream для Morgan
export const morganStream = {
  write: (message: string) => {
    // Удаляем перевод строки в конце, который добавляет morgan
    logger.info(message.trim());
  },
};

// Вспомогательные функции для специфичных типов логов
export const logSecurity = (message: string, metadata?: object) => {
  logger.warn(`[SECURITY] ${message}`, metadata);
};

export const logPerformance = (message: string, duration: number, metadata?: object) => {
  if (duration > 1000) {
    logger.warn(`[PERFORMANCE] ${message} (${duration}ms)`, metadata);
  } else {
    logger.debug(`[PERFORMANCE] ${message} (${duration}ms)`, metadata);
  }
};

export const logDatabase = (message: string, metadata?: object) => {
  logger.debug(`[DATABASE] ${message}`, metadata);
};

export const logAuth = (message: string, metadata?: object) => {
  logger.info(`[AUTH] ${message}`, metadata);
};

export default logger;
