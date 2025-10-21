// src/youtube-dl.ts
import { spawn } from "node:child_process"
import { Readable } from "node:stream"

export interface YouTubeDLInfo {
	title: string
	uploader: string
	duration?: number
	thumbnails?: Array<{
		url: string
		width?: number
		height?: number
	}>
	formats?: Array<{
		format_id: string
		ext: string
		vcodec?: string
		acodec?: string
		height?: number
		width?: number
		url?: string
	}>
	webpage_url?: string
	url?: string
}

export const getInfo = async (url: string, args: string[] = []): Promise<YouTubeDLInfo> =>
	new Promise((resolve, reject) => {
		const process = spawn("youtube-dl", ["--dump-json", "--no-playlist", ...args, url])

		let stdout = ""
		let stderr = ""

		process.stdout.on("data", (data) => {
			stdout += data.toString()
		})

		process.stderr.on("data", (data) => {
			stderr += data.toString()
		})

		process.once("error", (error) => {
			reject(new Error(`Failed to start youtube-dl: ${error.message}`))
		})

		process.once("close", (code) => {
			if (code && code !== 0) {
				reject(new Error(stderr.trim() || `youtube-dl exited with code ${code}`))
				return
			}

			try {
				resolve(JSON.parse(stdout))
			} catch (error) {
				reject(new Error(`Failed to parse youtube-dl output: ${String(error)}`))
			}
		})
	})

export const downloadFromInfo = (
	info: YouTubeDLInfo,
	output: string,
	args: string[] = [],
	onProgress?: (progress: string) => void
): { stdout: Readable } => {
	const process = spawn("youtube-dl", [
		"--newline",  // Выводить прогресс построчно для легкого парсинга
		"--no-playlist",
		"-o",
		output,
		...args,
		info.webpage_url || info.url || "",
	])

	// Передаём stderr если нужен прогресс
	if (onProgress) {
		process.stderr?.on('data', (data) => {
			onProgress(data.toString())
		})
	}

	return { stdout: process.stdout }
}