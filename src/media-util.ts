import { Context, InputFile } from "grammy"
import { removeHashtagsMentions } from './util'
import { downloadFromInfo, getInfo } from './youtube-dl'
import { deleteMessage, errorMessage } from './bot-util'
import type { Queue } from "./queue"
import { cookieArgs } from './environment'

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
	const userTag = `user=${ctx.from?.id}${ctx.from?.username ? ` @${ctx.from?.username}` : ""}`
	const chatTag = `chat=${ctx.chat?.id} type=${ctx.chat?.type}${(ctx as any).chat?.title ? ` title="${(ctx as any).chat.title}"` : ""}`
	console.log(`[${source}] ${chatTag} | ${userTag} | ${href}`)

	const processingMessage = await ctx.reply("🔄 Processing...", { disable_notification: true })
	let ok = false;

	await new Promise<void>((resolve) => {
		queue.add(async () => {
			try {
				const isYouTubeMusic = urlMatcher(href, "music.youtube.com")
				const formatSelector = "best[height<=1080]/best"
				const info = await getInfo(href, ["-f", formatSelector, "--no-playlist", ...(await cookieArgs())])

				const suitableFormat =
					info.formats?.find((f) => f.vcodec !== "none" && f.acodec !== "none" && typeof f.url === "string")
					?? info.formats?.find((f) => typeof f.url === "string")

				if (!suitableFormat?.url) throw new Error("No suitable format available")

				const title = removeHashtagsMentions(info.title)

				if (suitableFormat.vcodec !== "none" && !isYouTubeMusic) {
					const video = new InputFile({ url: suitableFormat.url! }, title)
					await ctx.replyWithVideo(video, { caption: title, supports_streaming: true, duration: info.duration })
					ok = true;
				} else if (suitableFormat.acodec !== "none") {
					const stream = downloadFromInfo(info, "-", ["-x", "--audio-format", "mp3"])
					const audio = new InputFile(stream.stdout)
					await ctx.replyWithAudio(audio, {
						caption: title,
						performer: info.uploader,
						title: info.title,
						thumbnail: getThumbnail(info.thumbnails),
						duration: info.duration,
					})
					ok = true;
				}
			} catch (error) {
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