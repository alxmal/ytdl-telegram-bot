import { vi } from "vitest"

// не пускаем тесты в сеть через bot-util → setup
vi.mock("../src/bot-util", () => ({
	deleteMessage: vi.fn(async () => { }),
	errorMessage: vi.fn(async () => { }),
}))

// не тянем реальный environment (нужен только cookieArgs)
vi.mock("../src/environment", () => ({
	cookieArgs: vi.fn(async () => []),
}))

// на всякий случай, если что-то всё же импортирует setup
vi.mock("../src/setup", () => ({
	bot: { api: {} },
	server: { close: () => { } },
}))