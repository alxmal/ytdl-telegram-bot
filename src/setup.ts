import type { ParseModeFlavor } from "@grammyjs/parse-mode"
import type { Context } from "grammy"

import { hydrateReply } from "@grammyjs/parse-mode"
import express from "express"
import { Bot, webhookCallback } from "grammy"
import { API_ROOT, BOT_TOKEN, WEBHOOK_PORT, WEBHOOK_URL } from "./environment"

export const bot = new Bot<ParseModeFlavor<Context>>(BOT_TOKEN, {
	client: { apiRoot: API_ROOT },
	botInfo: undefined,
})

await bot.api.setMyCommands(
	[{ command: "v", description: "Загрузить видео: /v <url>" }, { command: "chatid", description: "Узнать chat id" }],
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

bot.use(hydrateReply)

export const server = express()

server.use(express.json())
server.use(webhookCallback(bot, "express"))

console.log(`Starting bot with root ${API_ROOT}...`)
server.listen(WEBHOOK_PORT, async () => {
	await bot.api.setWebhook(WEBHOOK_URL)
	console.log(`Webhook set to ${WEBHOOK_URL}`)

	const me = await bot.api.getMe()
	console.log(`Bot started as @${me.username} on :${WEBHOOK_PORT}`)
})
