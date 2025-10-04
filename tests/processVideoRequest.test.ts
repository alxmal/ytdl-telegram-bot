import { describe, it, expect, vi, beforeEach } from "vitest"
import { processVideoRequest } from "../src/media-util"

vi.mock("../src/youtube-dl", () => ({
	getInfo: vi.fn(async () => ({
		title: "Video",
		uploader: "Author",
		duration: 123,
		thumbnails: [{ url: "https://t/100x100.jpg", resolution: "100x100" }],
		formats: [
			{ format_id: "18", ext: "mp4", vcodec: "h264", acodec: "mp4a", url: "https://cdn/video.mp4" },
		],
	})),
	downloadFromInfo: vi.fn(() => ({ stdout: {} as any })),
}))

vi.mock("../src/environment", () => ({
	cookieArgs: vi.fn(async () => []),
}))

vi.mock("../src/bot-util", () => ({
	deleteMessage: vi.fn(async () => { }),
	errorMessage: vi.fn(async () => { }),
}))

describe("processVideoRequest", () => {
	const mkCtx = () =>
	({
		from: { id: 1, username: "user" },
		chat: { id: 1, type: "private" },
		reply: vi.fn(async () => ({})),
		replyWithVideo: vi.fn(async () => ({})),
		replyWithAudio: vi.fn(async () => ({})),
	} as any)

	const queue = { add: (fn: any) => fn() } as any

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("sends video when progressive format is available", async () => {
		const ctx = mkCtx()
		await processVideoRequest(ctx, "https://youtube.com/watch?v=1", queue, "url")
		expect(ctx.replyWithVideo).toHaveBeenCalledTimes(1)
		expect(ctx.replyWithAudio).not.toHaveBeenCalled()
	})
})