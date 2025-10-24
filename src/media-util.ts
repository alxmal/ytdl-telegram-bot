import { Context, InputFile } from "grammy"
import { removeHashtagsMentions } from './util'
import { downloadFromInfo, getInfo } from './youtube-dl'
import { deleteMessage, errorMessage } from './bot-util'
import type { Queue } from "./queue"
import { cookieArgs } from './environment'
import logger from './logger'
import { parseYoutubeDLProgress, createProgressBar } from './ffmpeg-util'
import { unlink } from 'node:fs'

type Thumbnail = {
	url: string
	width?: number
	height?: number
	resolution?: string
}

/** NAV: UTIL urlMatcher
 * Проверяет, что хост URL оканчивается на `matcher` (например, "youtube.com").
 */
export const urlMatcher = (url: string, matcher: string) => {
	const parsed = new URL(url)
	return parsed.hostname.endsWith(matcher)
}

/** NAV: UTIL getThumbnail
 * Подбирает миниатюру подходящего размера для `sendAudio`.
 * Подробнее: https://core.telegram.org/bots/api#sendaudio
 */
export const getThumbnail = (thumbnails?: Thumbnail[]) => {
	if (!thumbnails) return undefined

	const MAX_SIZE = 320

	// Thumbnail sizes go from smallest to largest
	const reversed = [...thumbnails].reverse()

	const match = reversed.find((thumbnail) => {
		const { width, height, resolution } = thumbnail

		if (width && height) {
			return width <= MAX_SIZE && height <= MAX_SIZE
		}

		if (resolution) {
			const [w, h] = resolution.split("x").map((n) => Number.parseInt(n))
			if (!w || !h) return false

			return w <= MAX_SIZE && h <= MAX_SIZE
		}

		return false
	})

	if (match) return new InputFile({ url: match.url })
}

/** NAV: HELPER processVideoRequest
 * Унифицированная обработка скачивания/отправки видео или аудио по URL.
 * Переиспользуется в личке, в команде `/v`, и при упоминании бота.
 * @param ctx grammy Context
 * @param href ссылка на контент
 * @param queue очередь для сериализации задач
 * @param source источник вызова: "url" | "v" | "mention"
 */
export async function processVideoRequest(ctx: Context, href: string, queue: Queue, source: "url" | "v" | "mention"): Promise<boolean> {
	logger.info('Starting video processing', {
		source,
		chatId: ctx.chat?.id,
		chatType: ctx.chat?.type,
		chatTitle: (ctx as any).chat?.title,
		userId: ctx.from?.id,
		username: ctx.from?.username,
		url: href
	})

	const processingMessage = await ctx.reply("🔄 Ищу видео...", { disable_notification: true })
	let ok = false;

	await new Promise<void>((resolve) => {
		queue.add(async () => {
			try {
				const isYouTubeMusic = urlMatcher(href, "music.youtube.com")
				const formatSelector = "best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=1080]"
				const info = await getInfo(href, ["-f", formatSelector, "--no-playlist", ...(await cookieArgs())])

				// Обновляем сообщение после получения информации
				if (ctx.chat?.id) {
					await ctx.api.editMessageText(
						ctx.chat.id,
						processingMessage.message_id,
						"⬇️ Скачиваю..."
					).catch(() => { })
				}

				logger.debug('Video info retrieved', {
					title: info.title,
					duration: info.duration,
					uploader: info.uploader,
					formatsCount: info.formats?.length,
					url: href
				})

				// Проверяем что есть доступные форматы
				if (!info.formats || info.formats.length === 0) {
					throw new Error("No formats available")
				}

				const title = removeHashtagsMentions(info.title)

				if (!isYouTubeMusic) {
					// Функция обновления прогресса для видео
					let lastUpdateTime = 0
					let accumulatedOutput = ''  // Накапливаем вывод

					const updateProgress = (progressOutput: string) => {
						const now = Date.now()

						// Накапливаем вывод (нужно для парсинга)
						accumulatedOutput += progressOutput

						// Обновляем раз в 2 секунды (видео скачивается быстро)
						if (now - lastUpdateTime > 2000) {
							lastUpdateTime = now

							const progress = parseYoutubeDLProgress(accumulatedOutput)

							logger.debug('Parsed progress from youtube-dl video', {
								progress,
								hasProgress: progress !== null,
								hasChatId: !!ctx.chat?.id,
								outputSample: progressOutput.substring(0, 100)
							})

							if (progress !== null && ctx.chat?.id) {
								logger.debug('Updating video download progress', { progress })
								ctx.api.editMessageText(
									ctx.chat.id,
									processingMessage.message_id,
									`⬇️ Загружаю\n${createProgressBar(progress)} ${progress}%`
								).catch((err) => {
									logger.warn('Failed to update progress message', { error: err.message })
								})
							}
						}
					}

					const tempFile = await downloadFromInfo(info, ["-f", formatSelector], updateProgress)

					const video = new InputFile(tempFile)
					await ctx.replyWithVideo(video, { caption: title, supports_streaming: true, duration: info.duration })

					// Удаляем временный файл после отправки
					unlink(tempFile, (err) => {
						if (err) logger.error('Failed to delete temp file', { error: err.message })
					})

					logger.info('Video sent successfully', {
						chatId: ctx.chat?.id,
						userId: ctx.from?.id,
						title: title,
						duration: info.duration,
						url: href
					})
				}
			} catch (error) {
				logger.error('Video processing failed', {
					chatId: ctx.chat?.id,
					userId: ctx.from?.id,
					url: href,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined
				})

				return error instanceof Error
					? errorMessage(ctx.chat!, error.message)
					: errorMessage(ctx.chat!, `Couldn't download ${href}`)
			} finally {
				await deleteMessage(processingMessage)
				resolve()
			}
		})
	})
	return ok;
}