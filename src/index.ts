import { downloadFromInfo, getInfo } from "./youtube-dl"
import { InputFile } from "grammy"
import { deleteMessage, errorMessage } from "./bot-util"
import { link, t } from "./constants"
import {
	ADMIN_ID,
	ALLOW_GROUPS,
	cookieArgs,
	WHITELISTED_IDS,
	WHITELISTED_CHAT_IDS,
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
	// Ignore URL messages in group chats; only handle in private
	if (ctx.chat?.type !== "private") return await next()
	const [url] = ctx.entities("url")
	if (!url) return await next()

	const processingMessage = await ctx.replyWithHTML(t.processing, {
		disable_notification: true,
	})

	const userTag = `user=${ctx.from?.id}${ctx.from?.username ? ` @${ctx.from?.username}` : ""}`
	const chatTag = `chat=${ctx.chat.id} type=${ctx.chat.type}${(ctx as any).chat?.title ? ` title="${(ctx as any).chat.title}"` : ""}`
	console.log(`[url] ${chatTag} | ${userTag} | ${url.text}`)

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

				video = new InputFile({ url: suitableFormat.url! }, title)

				await ctx.replyWithVideo(video, {
					caption: title,
					supports_streaming: true,
					duration: info.duration,
					reply_parameters: {
						message_id: ctx.message?.message_id,
						allow_sending_without_reply: true,
					},
				})

				console.log(`[sent] video | chat=${ctx.chat.id} | title="${title}"`)

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

				await ctx.replyWithAudio(audio, {
					...audioOpts,
					reply_parameters: {
						message_id: ctx.message?.message_id,
						allow_sending_without_reply: true,
					},
				})

				console.log(`[sent] audio | chat=${ctx.chat.id} | title="${title}"`)

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

bot.command("vid", async (ctx) => {
	// Allow only in whitelisted chats
	if (!WHITELISTED_CHAT_IDS.includes(ctx.chat.id)) return

	// Extract URL after the command
	const messageText = ctx.message?.text || ""
	const urlMatch = messageText.match(/\/vid\s+(https?:\/\/\S+)/)
	if (!urlMatch) {
		await ctx.reply("❌ Usage: /vid <URL>\nExample: /vid https://youtube.com/watch?v=...")
		return
	}
	const url = urlMatch[1]!

	const userTag = `user=${ctx.from?.id}${ctx.from?.username ? ` @${ctx.from?.username}` : ""}`
	const chatTag = `chat=${ctx.chat.id} type=${ctx.chat.type}${(ctx as any).chat?.title ? ` title="${(ctx as any).chat.title}"` : ""}`
	console.log(`[vid] ${chatTag} | ${userTag} | ${url}`)


	const processingMessage = await ctx.reply("🔄 Processing...", { disable_notification: true })

	// Optional: forward to admin for visibility
	// if (ctx.chat.id !== ADMIN_ID) {
	// 	ctx.forwardMessage(ADMIN_ID, { disable_notification: true }).catch(() => { })
	// }

	queue.add(async () => {
		try {
			const isYouTubeMusic = urlMatcher(url, "music.youtube.com")
			const formatSelector = "best[height<=1080]/best"

			const info = await getInfo(url, ["-f", formatSelector, "--no-playlist", ...(await cookieArgs())])

			const suitableFormat =
				info.formats?.find((f) => f.vcodec !== "none" && f.acodec !== "none" && typeof f.url === "string") ??
				info.formats?.find((f) => typeof f.url === "string")
			if (!suitableFormat?.url) throw new Error("No suitable format available")

			const title = removeHashtagsMentions(info.title)

			if (suitableFormat.vcodec !== "none" && !isYouTubeMusic) {
				let video: InputFile | string
				video = new InputFile({ url: suitableFormat.url! }, title)

				await ctx.replyWithVideo(video, {
					caption: title,
					supports_streaming: true,
					duration: info.duration,
				})
				console.log(`[sent] video | chat=${ctx.chat.id} | title="${title}"`)

			} else if (suitableFormat.acodec !== "none") {
				const stream = downloadFromInfo(info, "-", ["-x", "--audio-format", "mp3"])
				const audio = new InputFile(stream.stdout)

				const audioOpts = {
					caption: title,
					performer: info.uploader,
					title: info.title,
					thumbnail: getThumbnail(info.thumbnails),
					duration: info.duration,
				} as const

				await ctx.replyWithAudio(audio, audioOpts)
				console.log(`[sent] audio | chat=${ctx.chat.id} | title="${title}"`)
			} else {
				throw new Error("No download available")
			}
		} catch (error) {
			return error instanceof Error
				? errorMessage(ctx.chat, error.message)
				: errorMessage(ctx.chat, `Couldn't download ${url}`)
		} finally {
			await deleteMessage(processingMessage)
		}
	})
})

bot.command("chatid", async (ctx) => {
	if (ctx.from?.id !== ADMIN_ID) return
	await ctx.reply(`chat id: ${ctx.chat.id}`)
})

bot.on("message:text", async (ctx) => {
	// Do not send reminders in group chats
	if (ctx.chat?.type !== "private") return
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
