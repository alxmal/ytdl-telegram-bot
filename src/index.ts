import { downloadFromInfo, getInfo } from "./youtube-dl"
import { InputFile } from "grammy"
import { deleteMessage, errorMessage } from "./bot-util"
import { link, t } from "./constants"
import {
	ADMIN_ID,
	ALLOW_GROUPS,
	cookieArgs,
	WHITELISTED_IDS,
	POST_TO_CHAT,
	POST_TO_CHAT_ID,
} from "./environment"
import { getThumbnail, urlMatcher } from "./media-util"
import { Queue } from "./queue"
import { bot } from "./setup"
import { translateText } from "./translate"
import { Updater } from "./updater"
import { chunkArray, removeHashtagsMentions } from "./util"

const queue = new Queue()
const updater = new Updater()

bot.use(async (ctx, next) => {
	if (ctx.chat?.type === "private") {
		return await next()
	}

	const isGroup = ["supergroup", "group"].includes(ctx.chat?.type ?? "")
	if (ALLOW_GROUPS && isGroup) {
		return await next()
	}
})

//? filter out messages from non-whitelisted users (silent deny)
bot.on("message:text", async (ctx, next) => {
	if (WHITELISTED_IDS.length === 0) return await next()
	if (WHITELISTED_IDS.includes(ctx.from?.id)) return await next()

	// Silent deny: do not reply, do not forward, just ignore
	return
})

bot.on("message:text", async (ctx, next) => {
	if (updater.updating === false) return await next()

	const maintenanceNotice = await ctx.replyWithHTML(t.maintenanceNotice)
	await updater.updating

	await deleteMessage(maintenanceNotice)
	await next()
})

bot.on("message:text").on("::url", async (ctx, next) => {
	const [url] = ctx.entities("url")
	if (!url) return await next()

	const processingMessage = await ctx.replyWithHTML(t.processing, {
		disable_notification: true,
	})

	if (ctx.chat.id !== ADMIN_ID) {
		ctx
			.forwardMessage(ADMIN_ID, { disable_notification: true })
			.then(async (forwarded) => {
				await bot.api.setMessageReaction(
					forwarded.chat.id,
					forwarded.message_id,
					[{ type: "emoji", emoji: "🤝" }],
				)
			})
	}

	queue.add(async () => {
		try {
			const isTiktok = urlMatcher(url.text, "tiktok.com")
			const isYouTubeMusic = urlMatcher(url.text, "music.youtube.com")

			// Для youtube-dl используем более простой селектор
			const formatSelector = "best[height<=1080]/best"

			const info = await getInfo(url.text, [
				"-f",
				formatSelector,
				"--no-playlist",
				...(await cookieArgs()),
			])

			console.log("youtube-dl info:", {
				title: info.title,
				uploader: info.uploader,
				formats: info.formats?.length || 0,
				url: url.text
			})

			// Находим пригодный формат (прогрессивный с url)
			const suitableFormat =
				info.formats?.find(
					(f) =>
						f.vcodec !== "none" &&
						f.acodec !== "none" &&
						typeof f.url === "string",
				) ?? info.formats?.find((f) => typeof f.url === "string")

			if (!suitableFormat || !suitableFormat.url) {
				console.log("No suitable format found. Available formats:", info.formats?.map(f => ({
					format_id: f.format_id,
					ext: f.ext,
					vcodec: f.vcodec,
					acodec: f.acodec,
					height: f.height,
					width: f.width
				})))
				throw new Error("No suitable format available")
			}

			const title = removeHashtagsMentions(info.title)

			if (suitableFormat.vcodec !== "none" && !isYouTubeMusic) {
				let video: InputFile | string

				if (isTiktok) {
					const stream = downloadFromInfo(info, "-")
					video = new InputFile(stream.stdout, title)
				} else {
					video = new InputFile({ url: suitableFormat.url }, title)
				}

				if (POST_TO_CHAT && POST_TO_CHAT_ID) {
					await bot.api.sendVideo(POST_TO_CHAT_ID, video, {
						caption: title,
						supports_streaming: true,
					})
				} else {
					await ctx.replyWithVideo(video, {
						caption: title,
						supports_streaming: true,
						duration: info.duration,
						reply_parameters: {
							message_id: ctx.message?.message_id,
							allow_sending_without_reply: true,
						},
					})
				}

			} else if (suitableFormat.acodec !== "none") {
				const stream = downloadFromInfo(info, "-", [
					"-x",
					"--audio-format",
					"mp3",
				])

				const audio = new InputFile(stream.stdout)

				const audioOpts = {
					caption: title,
					performer: info.uploader,
					title: info.title,
					thumbnail: getThumbnail(info.thumbnails),
					duration: info.duration,
				} as const

				if (POST_TO_CHAT && POST_TO_CHAT_ID) {
					await bot.api.sendAudio(POST_TO_CHAT_ID, audio, audioOpts)
				} else {
					await ctx.replyWithAudio(audio, {
						...audioOpts,
						reply_parameters: {
							message_id: ctx.message?.message_id,
							allow_sending_without_reply: true,
						},
					})
				}
			} else {
				throw new Error("No download available")
			}
		} catch (error) {
			// if (await useCobaltResolver()) return
			return error instanceof Error
				? errorMessage(ctx.chat, error.message)
				: errorMessage(ctx.chat, `Couldn't download ${url}`)
		} finally {
			await deleteMessage(processingMessage)
		}
	})
})

bot.on("message:text", async (ctx) => {
	const response = await ctx.replyWithHTML(t.urlReminder)

	if (ctx.from.language_code && ctx.from.language_code !== "en") {
		const translated = await translateText(
			t.urlReminder,
			ctx.from.language_code,
		)
		if (translated === t.urlReminder) return
		await bot.api.editMessageText(
			ctx.chat.id,
			response.message_id,
			translated,
			{ parse_mode: "HTML", link_preview_options: { is_disabled: true } },
		)
	}
})
