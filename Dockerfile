FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN pnpm install --frozen-lockfile

COPY src ./src

RUN apk add --no-cache python3 py3-pip ffmpeg
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir youtube-dl

# Создаем директорию для cookies
RUN mkdir -p /app/storage

EXPOSE ${TELEGRAM_WEBHOOK_PORT}

CMD ["npm", "start"]