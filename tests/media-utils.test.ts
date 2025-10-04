import { describe, it, expect } from "vitest"
import { urlMatcher, getThumbnail } from "../src/media-util"
import { InputFile } from "grammy"

describe("urlMatcher", () => {
	it("matches by domain suffix", () => {
		expect(urlMatcher("https://www.youtube.com/watch?v=1", "youtube.com")).toBe(true)
		expect(urlMatcher("https://music.youtube.com/track", "youtube.com")).toBe(true)
		expect(urlMatcher("https://example.com", "youtube.com")).toBe(false)
	})
})

describe("getThumbnail", () => {
	it("returns InputFile of a thumbnail <= 320x320", () => {
		const thumb = getThumbnail([
			{ url: "https://a/10x10.jpg", resolution: "10x10" },
			{ url: "https://b/500x500.jpg", resolution: "500x500" },
		])
		expect(thumb).toBeInstanceOf(InputFile)
	})

	it("returns undefined if none fits", () => {
		const thumb = getThumbnail([
			{ url: "https://b/500x500.jpg", resolution: "500x500" },
		])
		expect(thumb).toBeUndefined()
	})
})