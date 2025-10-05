import winston from 'winston'
import { NODE_ENV, LOG_LEVEL } from './environment'

// Определяем уровни логирования
const levels = {
	error: 0,    // Ошибки
	warn: 1,     // Предупреждения  
	info: 2,     // Информация
	http: 3,     // HTTP запросы
	debug: 4,    // Отладка
}

// Определяем цвета для каждого уровня
const colors = {
	error: 'red',
	warn: 'yellow',
	info: 'green',
	http: 'magenta',
	debug: 'white',
}

// Подключаем цвета к winston
winston.addColors(colors)

// Создаём формат для консоли (красивый, цветной)
const consoleFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), // Время
	winston.format.colorize({ all: true }), // Цвета
	winston.format.printf(
		(info) => `${info.timestamp} ${info.level}: ${info.message}`
	)
)

// Создаём формат для файлов (JSON, структурированный)
const fileFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.errors({ stack: true }), // Включаем stack trace для ошибок
	winston.format.json() // JSON формат
)

// Определяем транспорты (куда писать логи)
const transports = [
	// Консоль (для разработки)
	new winston.transports.Console({
		level: 'debug', // Показываем все уровни в консоли
		format: consoleFormat
	}),

	// Файл для ошибок
	new winston.transports.File({
		filename: 'logs/error.log',
		level: 'error',
		format: fileFormat
	}),

	// Файл для всех логов
	new winston.transports.File({
		filename: 'logs/combined.log',
		format: fileFormat
	})
]

// Создаём логгер
const logger = winston.createLogger({
	level: LOG_LEVEL || (NODE_ENV === 'development' ? 'debug' : 'info'),
	levels,
	transports,
})

export default logger
