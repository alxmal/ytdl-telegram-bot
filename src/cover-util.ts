import { Context, InputFile } from "grammy"
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations"
import { spawn } from "child_process"
import { promises as fs } from "fs"
import { join } from "path"
import logger from "./logger"
import { BOT_TOKEN, API_ROOT } from "./environment"

// Тип контекста для conversation (БЕЗ ConversationFlavor!)
type CoverContext = Context

/** NAV: UTIL getAudioDuration
 * Получает длительность аудио через FFprobe или FFmpeg
 */
async function getAudioDuration(audioPath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		logger.debug('Getting audio duration', { audioPath })

		// Сначала пробуем ffprobe
		const ffprobe = spawn('ffprobe', [
			'-v', 'error',
			'-show_entries', 'format=duration',
			'-of', 'default=noprint_wrappers=1:nokey=1',
			audioPath
		])

		let output = ''
		let errorOutput = ''

		ffprobe.stdout.on('data', (data) => { output += data })
		ffprobe.stderr.on('data', (data) => { errorOutput += data })

		ffprobe.on('close', (code) => {
			if (code === 0) {
				const duration = parseFloat(output.trim())
				logger.debug('Audio duration retrieved via ffprobe', { audioPath, duration })
				resolve(duration)
			} else {
				logger.warn('FFprobe failed, trying ffmpeg', {
					audioPath,
					exitCode: code,
					stderr: errorOutput,
					stdout: output
				})
				// Fallback: используем ffmpeg для получения длительности
				tryWithFFmpeg()
			}
		})

		ffprobe.on('error', (err) => {
			logger.warn('FFprobe not available, trying ffmpeg', {
				audioPath,
				error: err.message
			})
			// Fallback: используем ffmpeg
			tryWithFFmpeg()
		})

		// Fallback метод через ffmpeg
		function tryWithFFmpeg() {
			const ffmpeg = spawn('ffmpeg', ['-i', audioPath])
			let ffmpegOutput = ''

			ffmpeg.stderr.on('data', (data) => { ffmpegOutput += data })

			ffmpeg.on('close', () => {
				// Ищем Duration: HH:MM:SS.mm в выводе ffmpeg
				const match = ffmpegOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/)
				if (match) {
					const hours = parseInt(match[1]!)
					const minutes = parseInt(match[2]!)
					const seconds = parseFloat(match[3]!)
					const duration = hours * 3600 + minutes * 60 + seconds
					logger.debug('Audio duration retrieved via ffmpeg', { audioPath, duration })
					resolve(duration)
				} else {
					logger.error('Failed to parse duration from ffmpeg', {
						audioPath,
						output: ffmpegOutput
					})
					reject(new Error('Failed to get audio duration from both ffprobe and ffmpeg'))
				}
			})

			ffmpeg.on('error', (err) => {
				logger.error('FFmpeg also failed', {
					audioPath,
					error: err.message
				})
				reject(new Error(`Both ffprobe and ffmpeg failed: ${err.message}`))
			})
		}
	})
}

/** NAV: UTIL createRotatingCover
 * Создаёт видео с вращающейся обложкой (360° каждые 10 секунд)
 */
async function createRotatingCover(
	audioPath: string,
	imagePath: string,
	outputPath: string,
	duration: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn('ffmpeg', [
			'-loop', '1',
			'-i', imagePath,
			'-i', audioPath,
			'-filter_complex', [
				// Делаем круглую маску с прозрачностью
				'[0:v]scale=512:512,format=rgba',
				'geq=\'lum=p(X,Y):a=if(lt(hypot(W/2-X,H/2-Y),W/2),255,0)\'',
				// Вращение: 360 градусов каждые 10 секунд
				'rotate=angle=2*PI*t/10:fillcolor=none:ow=512:oh=512',
				'format=yuva420p[v]',
			].join(','),
			'-map', '[v]',
			'-map', '1:a',
			'-c:v', 'libx264',
			'-c:a', 'copy',
			'-shortest',
			'-t', duration.toString(),
			'-y',
			outputPath
		])

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`FFmpeg exited with code ${code}`))
			}
		})

		ffmpeg.stderr.on('data', (data) => {
			logger.debug('FFmpeg output', { message: data.toString() })
		})
	})
}

/** NAV: CONVERSATION coverConversation
 * Диалог для создания музыкального видео с вращающейся обложкой
 */
export async function coverConversation(
	conversation: Conversation<CoverContext>,
	ctx: CoverContext
) {
	const userId = ctx.from?.id
	const chatId = ctx.chat?.id

	logger.info('Cover conversation started', {
		userId,
		username: ctx.from?.username,
		chatId
	})

	// ========== ШАГ 1: Запрос MP3 файла ==========
	await ctx.reply(
		'🎵 Отправьте MP3 файл для создания музыкального видео',
		{ disable_notification: true }
	)

	// Ждём аудио или документ
	const audioCtx = await conversation.waitFor([':audio', ':document'])

	const audio = audioCtx.message?.audio ||
		(audioCtx.message?.document?.mime_type?.includes('audio/mpeg')
			? audioCtx.message.document
			: null)

	// Валидация MP3
	if (!audio ||
		(!audio.mime_type?.includes('audio/mpeg') &&
			!audio.file_name?.endsWith('.mp3'))) {
		await ctx.reply('❌ Нужен файл в формате MP3')
		logger.warn('Invalid audio format in cover conversation', {
			userId,
			mimeType: audioCtx.message?.document?.mime_type
		})
		return
	}

	// Обработка аудио
	const processingAudioMsg = await ctx.reply('⏳ Обрабатываю аудио...')

	let audioPath: string | undefined
	let duration: number

	try {
		// Скачиваем аудио через getFile
		audioPath = join('/tmp', `audio_${userId}_${Date.now()}.mp3`)

		logger.debug('Getting file info from Telegram', {
			userId,
			fileId: audio.file_id,
			audioPath
		})

		// Получаем информацию о файле
		const file = await ctx.api.getFile(audio.file_id)

		logger.debug('File info received', {
			userId,
			fileId: audio.file_id,
			filePath: file.file_path || 'undefined',
			fileSize: file.file_size
		})

		// Скачиваем файл
		if (!file.file_path) {
			throw new Error('File path is empty from Telegram API')
		}

		// Проверяем, это локальный путь или URL path
		const isLocalPath = file.file_path.startsWith('/var/lib/telegram-bot-api')

		if (isLocalPath) {
			// Локальный API возвращает абсолютный путь - читаем файл напрямую
			logger.debug('Reading file from local path', {
				userId,
				filePath: file.file_path,
				fileSize: file.file_size
			})

			try {
				await fs.copyFile(file.file_path, audioPath)
				const stats = await fs.stat(audioPath)
				logger.debug('File copied from local storage', {
					userId,
					sourceSize: file.file_size,
					copiedSize: stats.size
				})
			} catch (err) {
				logger.error('Failed to copy file from local storage', {
					userId,
					filePath: file.file_path,
					error: err instanceof Error ? err.message : 'Unknown'
				})
				throw new Error(`Failed to copy audio from local storage: ${err}`)
			}
		} else {
			// Стандартный API - скачиваем через HTTP
			const fileUrl = `${API_ROOT}/file/bot${BOT_TOKEN}/${file.file_path}`
			logger.debug('Downloading from URL', {
				userId,
				apiRoot: API_ROOT,
				filePath: file.file_path,
				urlPreview: fileUrl.substring(0, 60) + '...'
			})

			const response = await fetch(fileUrl)

			if (!response.ok) {
				logger.error('Failed to download file', {
					userId,
					status: response.status,
					statusText: response.statusText,
					filePath: file.file_path,
					fileSize: file.file_size
				})
				throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
			}

			const buffer = await response.arrayBuffer()
			logger.debug('File buffer received', {
				userId,
				bufferSize: buffer.byteLength
			})

			await fs.writeFile(audioPath, Buffer.from(buffer))
		}

		// Проверяем что файл создался
		const stats = await fs.stat(audioPath)
		logger.debug('Audio file downloaded', {
			userId,
			audioPath,
			fileSize: stats.size,
			fileMode: stats.mode.toString(8) // права доступа в восьмеричном виде
		})

		// Проверяем что файл читаемый
		try {
			await fs.access(audioPath, fs.constants.R_OK)
			logger.debug('Audio file is readable', { audioPath })
		} catch (err) {
			throw new Error(`Audio file is not readable: ${err}`)
		}

		// Получаем длительность
		duration = await getAudioDuration(audioPath)

		await ctx.api.deleteMessage(chatId!, processingAudioMsg.message_id)

		logger.info('Audio processed in cover conversation', {
			userId,
			audioPath,
			duration,
			fileSize: audio.file_size
		})
	} catch (error) {
		await ctx.reply('❌ Ошибка при обработке аудио')

		// Очистка аудио файла если он был создан
		if (audioPath) {
			await fs.unlink(audioPath).catch(() => { })
			logger.debug('Audio file cleaned up after error', { audioPath })
		}

		logger.error('Audio processing failed in cover conversation', {
			userId,
			error: error instanceof Error ? error.message : 'Unknown'
		})
		return
	}

	// ========== ШАГ 2: Запрос PNG изображения ==========
	await ctx.reply(
		`✅ Аудио получено (${Math.round(duration)}s)\n\n` +
		'🖼️ Теперь отправьте изображение для обложки (PNG, желательно 512x512)',
		{ disable_notification: true }
	)

	// Ждём фото или документ
	const imageCtx = await conversation.waitFor([':photo', ':document'])

	const photo = imageCtx.message?.photo?.[imageCtx.message.photo.length - 1] ||
		(imageCtx.message?.document?.mime_type?.includes('image/')
			? imageCtx.message.document
			: null)

	// Валидация изображения
	if (!photo) {
		await ctx.reply('❌ Нужно изображение')
		logger.warn('No image in cover conversation', { userId })
		// Очистка аудио файла
		await fs.unlink(audioPath).catch(() => { })
		return
	}

	// Обработка изображения и создание видео
	const processingVideoMsg = await ctx.reply('🎬 Создаю музыкальное видео...')

	try {
		// Скачиваем изображение
		const file = await ctx.api.getFile(photo.file_id)
		const imagePath = join('/tmp', `image_${userId}_${Date.now()}.png`)

		logger.debug('Downloading image file', {
			userId,
			fileId: photo.file_id,
			filePath: file.file_path,
			imagePath
		})

		// Проверяем, это локальный путь или URL path
		const isLocalPath = file.file_path?.startsWith('/var/lib/telegram-bot-api')

		if (isLocalPath) {
			// Локальный API - копируем файл напрямую
			logger.debug('Reading image from local path', {
				userId,
				filePath: file.file_path,
				fileSize: file.file_size
			})

			try {
				await fs.copyFile(file.file_path!, imagePath)
				const stats = await fs.stat(imagePath)
				logger.debug('Image copied from local storage', {
					userId,
					sourceSize: file.file_size,
					copiedSize: stats.size
				})
			} catch (err) {
				logger.error('Failed to copy image from local storage', {
					userId,
					filePath: file.file_path,
					error: err instanceof Error ? err.message : 'Unknown'
				})
				throw new Error(`Failed to copy image from local storage: ${err}`)
			}
		} else {
			// Стандартный API - скачиваем через HTTP
			const fileUrl = `${API_ROOT}/file/bot${BOT_TOKEN}/${file.file_path}`
			logger.debug('Fetching image from Telegram', {
				userId,
				apiRoot: API_ROOT,
				filePath: file.file_path,
				urlPreview: fileUrl.substring(0, 60) + '...'
			})

			const response = await fetch(fileUrl)

			if (!response.ok) {
				logger.error('Failed to fetch image from Telegram', {
					userId,
					status: response.status,
					statusText: response.statusText,
					filePath: file.file_path
				})
				throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
			}

			const buffer = await response.arrayBuffer()
			await fs.writeFile(imagePath, Buffer.from(buffer))
		}

		// Создаём видео с вращающейся обложкой
		const outputPath = join('/tmp', `video_${userId}_${Date.now()}.mp4`)
		await createRotatingCover(audioPath, imagePath, outputPath, duration)

		// Отправляем видео
		const video = new InputFile(outputPath)
		await ctx.replyWithVideo(video, {
			caption: '🎵 Ваше музыкальное видео готово!',
			supports_streaming: true,
			duration: Math.round(duration)
		})

		// Удаляем сообщение "Создаю музыкальное видео..."
		await ctx.api.deleteMessage(chatId!, processingVideoMsg.message_id).catch(() => { })

		// Очистка временных файлов
		logger.debug('Cleaning up temporary files', {
			userId,
			audioPath,
			imagePath,
			outputPath
		})

		await Promise.all([
			fs.unlink(audioPath).catch((err) => {
				logger.warn('Failed to delete audio file', { audioPath, error: err.message })
			}),
			fs.unlink(imagePath).catch((err) => {
				logger.warn('Failed to delete image file', { imagePath, error: err.message })
			}),
			fs.unlink(outputPath).catch((err) => {
				logger.warn('Failed to delete output video', { outputPath, error: err.message })
			})
		])

		logger.info('Cover video created successfully', {
			userId,
			duration,
			filesCleanedUp: true
		})
	} catch (error) {
		await ctx.reply('❌ Ошибка при создании видео')

		// Очистка при ошибке
		logger.debug('Cleaning up files after error', { userId, audioPath })

		// Удаляем аудио файл (он точно есть)
		await fs.unlink(audioPath).catch((err) => {
			logger.warn('Failed to delete audio file after error', {
				audioPath,
				error: err.message
			})
		})

		logger.error('Cover video creation failed', {
			userId,
			error: error instanceof Error ? error.message : 'Unknown',
			stack: error instanceof Error ? error.stack : undefined,
			audioPathCleaned: true
		})
	}
}

