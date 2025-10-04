# telegram-ytdl



### Installation

- [Install Docker](https://docs.docker.com/engine/install)
- Create a folder and put the [compose.yml](./compose.yml) into it.
- Fill out and adjust the following variables in the docker-compose.yml file:

  | Variable                | Description                                                                                                                                    |
  | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `TELEGRAM_BOT_TOKEN`    | Your Telegram bot token (get it from [BotFather][botfather])                                                                                   |
  | `WHITELISTED_IDS`       | A comma-separated list of Telegram user IDs that are allowed to use the bot (get them from [this bot][id-bot]), leave empty to allow all users |
  | `ADMIN_ID`              | Your Telegram user ID (get it from [this bot][id-bot])                                                                                         |
  | `ALLOW_GROUPS`          | Whether to allow groups (defaults to `"false"`, set to `"true"` to enable)                                                                     |
  | `TELEGRAM_API_ID`       | Your Telegram API ID (get it [here][telegram-api-id])                                                                                          |
  | `TELEGRAM_API_HASH`     | Your Telegram API hash (get it [here][telegram-api-id])                                                                                        |
  | `TELEGRAM_API_ROOT`     | The URL of your Telegram bot API server (can probably be left unchanged)                                                                       |
  | `TELEGRAM_WEBHOOK_PORT` | The port the bot will listen on (can probably be left unchanged)                                                                               |
  | `TELEGRAM_WEBHOOK_URL`  | The URL of your Telegram bot API server (can probably be left unchanged)                                                                       |
  | `YTDL_AUTOUPDATE`       | Whether to automatically update yt-dlp (defaults to `"true"`, set to `"false"` to disable)                                                     |
  | `OPENAI_API_KEY`        | Your OpenAI API key (optional, used for auto-translation)                                                                                      |

- Run `docker compose up -d` in the folder you created.

## Commands

- `/v <url>` (alias `/vid`): download and post the video in this chat (only in chats from `WHITELISTED_CHAT_IDS`; if `WHITELISTED_IDS` is set, only those users can run it).
- Mention: `@botname <url>` — same as `/v`, in whitelisted chats.
- `/chatid` — replies with the current chat id (admin `ADMIN_ID` only).

In private chats: just send a URL and the bot will reply with video/audio.

## Configuration

- `WHITELISTED_CHAT_IDS`: comma-separated chat IDs where `/v` and mentions are allowed.
- `WHITELISTED_IDS`: comma-separated user IDs; if empty, everyone is allowed.
- `ALLOW_GROUPS`: set to `"true"` to enable group handlers.
- `YTDL_AUTOUPDATE`: keep `youtube-dl` up-to-date (defaults to `"true"`).

More details in `docs/usage.md`.

[yt-dlp]: https://github.com/yt-dlp/yt-dlp
[telegram-api-id]: https://core.telegram.org/api/obtaining_api_id
[id-bot]: https://t.me/getidsbot
[botfather]: https://t.me/BotFather
[hetzner]: https://hetzner.cloud/?ref=e5ntAQJVvxX1
