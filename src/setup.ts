import type { ParseModeFlavor } from "@grammyjs/parse-mode"
import type { Context, SessionFlavor } from "grammy"
import type { ConversationFlavor } from "@grammyjs/conversations"

import { hydrateReply } from "@grammyjs/parse-mode"
import { conversations, createConversation } from "@grammyjs/conversations"
import express from "express"
import { Bot, session, webhookCallback } from "grammy"
import { ALLOW_GROUPS, API_ROOT, BOT_TOKEN, WEBHOOK_PORT, WEBHOOK_URL } from "./environment"
import logger from "./logger"

// Тип контекста с parse mode, session и conversations
type BotContext = ParseModeFlavor<Context> & SessionFlavor<{}> & ConversationFlavor<Context>

export const bot = new Bot<BotContext>(BOT_TOKEN, {
	client: { apiRoot: API_ROOT },
	botInfo: undefined,
})

// Session для conversations (обязательно!)
bot.use(session({
	initial: () => ({})
}))

// Подключаем conversations plugin
bot.use(conversations())

// Регистрируем conversation для /cover (динамический импорт)
const { coverConversation } = await import("./cover-util.js")
bot.use(createConversation(coverConversation))

await bot.api.setMyCommands(
	[
		{ command: "v", description: "Загрузить видео: /v <url>" },
		{ command: "cover", description: "Создать музыкальное видео с обложкой" },
		{ command: "chatid", description: "Узнать chat id" }
	],
	{ scope: { type: "all_group_chats" } }, // команды для всех групп
)

// (опционально) команды для лички
await bot.api.setMyCommands(
	[], // например, пусто или свои команды для лички
	{ scope: { type: "all_private_chats" } },
)

// (опционально) для конкретного чата
// await bot.api.setMyCommands(
//   [{ command: "vid", description: "Загрузить видео" }],
//   { scope: { type: "chat", chat_id: -1001234567890 } },
// )

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

bot.use(hydrateReply)

export const server = express()

server.use(express.json())
server.use(webhookCallback(bot, "express", { timeoutMilliseconds: 3000, onTimeout: (_req, _res) => { _res.sendStatus(200) } }))

logger.info('Starting bot', { apiRoot: API_ROOT })
server.listen(WEBHOOK_PORT, async () => {
	await bot.api.setWebhook(WEBHOOK_URL)
	logger.info('Webhook configured', { webhookUrl: WEBHOOK_URL })

	const me = await bot.api.getMe()
	logger.info('Bot started successfully', {
		username: me.username,
		port: WEBHOOK_PORT
	})
})
