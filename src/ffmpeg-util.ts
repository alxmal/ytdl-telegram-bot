/** NAV: UTIL parseFFmpegProgress
 * Парсит прогресс из вывода FFmpeg
 * @param output строка вывода FFmpeg (stdout или stderr)
 * @param totalDuration общая длительность в секундах
 * @returns прогресс в процентах (0-100) или null если не удалось распарсить
 */
export function parseFFmpegProgress(
	output: string,
	totalDuration: number
): number | null {
	// Парсим из stdout (когда -progress pipe:1)
	const msMatch = output.match(/out_time_ms=(\d+)/)
	if (msMatch) {
		const currentMs = parseInt(msMatch[1]!) / 1000000  // микросекунды → секунды
		return Math.min(Math.round((currentMs / totalDuration) * 100), 100)
	}

	// Парсим из stderr (стандартный вывод FFmpeg)
	const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
	if (timeMatch) {
		const hours = parseInt(timeMatch[1]!)
		const minutes = parseInt(timeMatch[2]!)
		const seconds = parseFloat(timeMatch[3]!)
		const currentTime = hours * 3600 + minutes * 60 + seconds
		return Math.min(Math.round((currentTime / totalDuration) * 100), 100)
	}

	return null
}

/** NAV: UTIL createProgressBar
 * Создаёт визуальный прогресс-бар
 * @param percent прогресс в процентах (0-100)
 * @returns строка типа "███░░░░░░░"
 */
export function createProgressBar(percent: number): string {
	const filled = Math.floor(percent / 10)
	const empty = 10 - filled
	return '█'.repeat(filled) + '░'.repeat(empty)
}

/** NAV: UTIL parseYoutubeDLProgress
 * Парсит прогресс из вывода youtube-dl/FFmpeg
 * @param output строка вывода youtube-dl stderr
 * @returns прогресс в процентах (0-100) или null если не удалось распарсить
 */
export function parseYoutubeDLProgress(output: string): number | null {
	// youtube-dl выводит: [download]  45.2% of 10.50MiB at 1.23MiB/s ETA 00:05
	const downloadMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/)
	if (downloadMatch) {
		return Math.min(Math.round(parseFloat(downloadMatch[1]!)), 100)
	}

	// FFmpeg прогресс при конвертации: size=1024kB time=00:00:05.00
	const ffmpegMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/)
	if (ffmpegMatch) {
		// Без общей длительности просто показываем что идёт процесс
		// Можно вернуть фиксированное значение или null
		return 50  // Показываем что в процессе
	}

	return null
}

