# Telegram YTDL Bot – Usage and API

## Overview

- This bot downloads videos/audio using `youtube-dl` and sends them in Telegram.
- Modes:
  - Private chats: send a URL → bot replies with video or audio.
  - Group chats: use `/v <url>` (alias of `/vid`) or mention `@botname <url>` in whitelisted chats.
- Purpose: a simple, fast, and mobile-friendly way to fetch media from supported sites and deliver them directly via Telegram.

Key concepts:
- Whitelisted users: `WHITELISTED_IDS`
- Whitelisted chats: `WHITELISTED_CHAT_IDS`
- Unified download helper: `processVideoRequest`

## API Documentation

### processVideoRequest

Signature:
```ts
async function processVideoRequest(
  ctx: Context,
  href: string,
  queue: Queue,
  source: "url" | "vid" | "mention"
): Promise<void>
```

Parameters:
- ctx: grammy `Context`
- href: target media URL
- queue: a sequential queue to avoid concurrent heavy work
- source: for logging; caller type ("url" for private, "vid" for /v, "mention" for @mention)

Returns:
- Promise<void>. Sends a video or audio to the originating chat.

Behavior:
- Uses `youtube-dl --dump-json` to retrieve media info.
- Picks a suitable progressive format (`best[height<=1080]/best` logic) and:
  - Sends video with `replyWithVideo` (supports_streaming=true)
  - Or extracts audio to MP3 and sends with `replyWithAudio` (includes thumbnail if available)

Error handling:
- No suitable format → throws “No suitable format available”.
- Any exception is logged and an error message is sent to the chat.

Example usage:
```ts
await processVideoRequest(ctx, href, queue, "url")
await processVideoRequest(ctx, urlFromCommand, queue, "vid")
await processVideoRequest(ctx, hrefFromMention, queue, "mention")
```

### Handlers and Commands

- Private URL handler (NAV: HANDLER private-url)
  - Scope: only private chats
  - Extracts URL from entities → calls `processVideoRequest`

- Group command `/v` (alias `/vid`) (NAV: COMMAND v)
  - Requires `ctx.chat.id` to be in `WHITELISTED_CHAT_IDS`
  - If `WHITELISTED_IDS` is set, the user must be included there
  - Parses `/v <url>` message text and calls `processVideoRequest`

- Mention with URL (NAV: HANDLER mention-with-url)
  - Requires whitelisted chat
  - Must mention `@botname` and include a URL in the same message
  - Applies the same user whitelist rule as `/v`

## Implementation Details

Architecture:
- `src/index.ts`: middlewares, commands, and message handlers
- `src/media-util.ts`: `urlMatcher`, `getThumbnail`, and `processVideoRequest`
- `src/youtube-dl.ts`: thin wrapper that spawns `youtube-dl`
- `src/updater.ts`: nightly updater using `youtube-dl -U`
- `src/environment.ts`: env parsing

Design decisions:
- DRY: one helper `processVideoRequest` used across all entry points.
- Queue ensures predictable, serialized processing and avoids overload.
- Conservative format selector (`best[height<=1080]/best`) for Telegram compatibility.

Dependencies:
- `grammy` for Telegram Bot API
- `youtube-dl` binary available in the runtime image
- `ffmpeg` for audio extraction
- Docker/Compose for deployment

## Examples

Private chat:
```text
You → https://youtube.com/watch?v=...
Bot → [video reply]
```

Group chat (command):
```text
You → /v https://youtube.com/watch?v=...
Bot → [video in the same chat]
```

Group chat (mention):
```text
You → @botname https://youtube.com/watch?v=...
Bot → [video in the same chat]
```

Best practices:
- Set `WHITELISTED_CHAT_IDS` to control where group usage is allowed.
- If you need to limit users, set `WHITELISTED_IDS` (leave empty to allow all users).
- Keep auto-update of `youtube-dl` enabled unless you have a reason to pin.

Common pitfalls:
- Missing URL entity → handler does nothing.
- Chat not in `WHITELISTED_CHAT_IDS` → `/v` and mentions are ignored.
- Outdated `youtube-dl` causes extraction errors → use the updater.
