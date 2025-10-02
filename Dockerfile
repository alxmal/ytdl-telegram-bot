FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN pnpm install --frozen-lockfile

COPY src ./src

# deps
RUN apk add --no-cache python3 py3-pip ffmpeg ca-certificates openssl && update-ca-certificates

# ставим youtube-dl без апгрейда pip
RUN python3 -m pip install -vv --no-cache-dir --disable-pip-version-check youtube-dl

# Создаем директорию для cookies
RUN mkdir -p /app/storage

EXPOSE ${TELEGRAM_WEBHOOK_PORT}

CMD ["npm", "start"]