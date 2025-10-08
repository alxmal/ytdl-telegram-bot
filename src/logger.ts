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
	winston.format.printf((info) => {
		// Основное сообщение
		let log = `${info.timestamp} ${info.level}: ${info.message}`

		// Добавляем детали если они есть
		const details = []
		if (info.source) details.push(`source=${info.source}`)
		if (info.chatId) details.push(`chat=${info.chatId}`)
		if (info.chatType) details.push(`type=${info.chatType}`)
		if (info.chatTitle) details.push(`title="${info.chatTitle}"`)
		if (info.userId) details.push(`user=${info.userId}`)
		if (info.username) details.push(`@${info.username}`)
		if (info.url) details.push(`url=${info.url}`)
		if (info.title) details.push(`title="${info.title}"`)
		if (info.duration) details.push(`duration=${info.duration}s`)
		if (info.uploader) details.push(`uploader="${info.uploader}"`)
		if (info.error) details.push(`error="${info.error}"`)

		// Добавляем поля для диагностики /cover
		if (info.fileId) details.push(`fileId=${info.fileId}`)
		if (info.filePath) details.push(`filePath=${info.filePath}`)
		if (info.fileSize) details.push(`fileSize=${info.fileSize}`)
		if (info.apiRoot) details.push(`apiRoot=${info.apiRoot}`)
		if (info.urlPreview) details.push(`url=${info.urlPreview}`)
		if (info.status) details.push(`status=${info.status}`)
		if (info.statusText) details.push(`statusText=${info.statusText}`)
		if (info.bufferSize) details.push(`bufferSize=${info.bufferSize}`)
		if (info.audioPath) details.push(`audioPath=${info.audioPath}`)
		if (info.imagePath) details.push(`imagePath=${info.imagePath}`)
		if (info.output) details.push(`output="${info.output}"`)
		if (info.progress) details.push(`progress=${info.progress}%`)
		if (info.message) details.push(`msg="${info.message}"`)

		if (details.length > 0) {
			log += ` | ${details.join(' ')}`
		}

		return log
	})
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
