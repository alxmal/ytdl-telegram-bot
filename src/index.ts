import { deleteMessage } from "./bot-util"
import { t } from "./constants"
import {
	ADMIN_ID,
	ALLOW_GROUPS,
	WHITELISTED_IDS,
	WHITELISTED_CHAT_IDS,
} from "./environment"
import { processVideoRequest } from "./media-util"
import { Queue } from "./queue"
import { bot } from "./setup"
import { translateText } from "./translate"
import { Updater } from "./updater"


const queue = new Queue()
const updater = new Updater()

/** NAV: MIDDLEWARE allow-private-and-groups
 * Пропускает личку всегда; группы — если включён `ALLOW_GROUPS`.
 */
bot.use(async (ctx, next) => {
	if (ctx.chat?.type === "private") {
		return await next()
	}

	const isGroup = ["supergroup", "group"].includes(ctx.chat?.type ?? "")
	if (ALLOW_GROUPS && isGroup) {
		return await next()
	}
})

/** NAV: MIDDLEWARE whitelist-users
 * Разрешает сообщения только от `WHITELISTED_IDS` (если список не пуст).
 * Тихо игнорирует остальных.
 */
bot.on("message:text", async (ctx, next) => {
	if (WHITELISTED_IDS.length === 0) return await next()
	if (WHITELISTED_CHAT_IDS.includes(ctx.chat?.id ?? 0)) return await next()
	if (ctx.from && WHITELISTED_IDS.includes(ctx.from.id)) return await next()
	return
})

bot.on("message:text", async (ctx, next) => {
	if (updater.updating === false) return await next()

	const maintenanceNotice = await ctx.replyWithHTML(t.maintenanceNotice)
	await updater.updating

	await deleteMessage(maintenanceNotice)
	await next()
})

/** NAV: HANDLER private-url
 * Личка: ловит URL и отправляет видео/аудио ответом в тот же чат.
 */
bot.on("message:text").on("::url", async (ctx, next) => {
	// Ignore URL messages in group chats; only handle in private
	if (ctx.chat?.type !== "private") return await next()
	const [urlEnt] = ctx.entities("url")
	const href = urlEnt?.text
	if (!href) return await next()

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

	await processVideoRequest(ctx, href, queue, "url")
})

/** NAV: HANDLER mention-with-url
 * Группы: сообщение с упоминанием бота и URL → скачать и отправить в этот чат.
 */
bot.on("message:text", async (ctx, next) => {
	// Только whitelisted чаты
	if (!WHITELISTED_CHAT_IDS.includes(ctx.chat?.id ?? 0)) return await next()

	// Проверка юзера как в /vid (если список не пуст)
	if (WHITELISTED_IDS.length > 0 && (!ctx.from || !WHITELISTED_IDS.includes(ctx.from.id))) {
		return
	}

	// Упоминание бота
	const me = bot.botInfo?.username
	if (!me) return await next()
	const mentioned = ctx.entities("mention").some((m) => m.text === `@${me}`)
	if (!mentioned) return await next()

	// URL в сообщении
	const [urlEnt] = ctx.entities("url")
	const href = urlEnt?.text
	if (!href) return await next()

	await processVideoRequest(ctx, href, queue, "mention")
})

/** NAV: COMMAND vid
 * Группы: команда `/vid <url>` в чатах из `WHITELISTED_CHAT_IDS`.
 * Если `WHITELISTED_IDS` задан, доступна только перечисленным юзерам.
 */
bot.command("vid", async (ctx) => {
	// Allow only in whitelisted chats
	if (!WHITELISTED_CHAT_IDS.includes(ctx.chat.id)) return
	if (WHITELISTED_IDS.length > 0 && (!ctx.from || !WHITELISTED_IDS.includes(ctx.from.id))) return

	// Extract URL after the command
	const messageText = ctx.message?.text || ""
	const urlMatch = messageText.match(/\/vid\s+(https?:\/\/\S+)/)
	if (!urlMatch) {
		await ctx.reply("❌ Usage: /vid <URL>\nExample: /vid https://youtube.com/watch?v=...")
		return
	}
	const url = urlMatch[1]!

	await processVideoRequest(ctx, url, queue, "vid")
})

/** NAV: COMMAND chatid
 * Только для админа: показывает `chat.id` текущего чата.
 */
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
