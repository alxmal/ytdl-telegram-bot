import { describe, it, expect } from "vitest"

describe("/v parsing", () => {
	const re = /\/v\s+(https?:\/\/\S+)/
	it("extracts url after /v", () => {
		const m = "/v https://youtube.com/watch?v=1".match(re)
		expect(m?.[1]).toBe("https://youtube.com/watch?v=1")
	})
	it("fails without url", () => {
		expect("/v".match(re)).toBeNull()
	})
})