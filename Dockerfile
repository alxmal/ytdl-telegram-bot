FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN pnpm install --frozen-lockfile

COPY src ./src

# deps
RUN apk add --no-cache python3 ffmpeg curl

# youtube-dl nightly (zipimport executable)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
	&& chmod +x /usr/local/bin/yt-dlp

# Создаем директорию для cookies
RUN mkdir -p /app/storage

EXPOSE ${TELEGRAM_WEBHOOK_PORT}

CMD ["npm", "start"]