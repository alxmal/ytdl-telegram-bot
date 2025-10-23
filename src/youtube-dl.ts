// src/yt-dlp.ts
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
		const process = spawn("yt-dlp", ["--dump-json", "--no-playlist", ...args, url])

		let stdout = ""
		let stderr = ""

		process.stdout.on("data", (data) => {
			stdout += data.toString()
		})

		process.stderr.on("data", (data) => {
			stderr += data.toString()
		})

		process.once("error", (error) => {
			reject(new Error(`Failed to start yt-dlp: ${error.message}`))
		})

		process.once("close", (code) => {
			if (code && code !== 0) {
				reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`))
				return
			}

			try {
				const info = JSON.parse(stdout)

				// Логируем полученную информацию
				console.log('=== yt-dlp INFO ===')
				console.log('Title:', info.title)
				console.log('Duration:', info.duration)
				console.log('Uploader:', info.uploader)
				console.log('Formats count:', info.formats?.length)
				console.log('Formats:', info.formats?.map((f: any) => ({
					format_id: f.format_id,
					ext: f.ext,
					vcodec: f.vcodec,
					acodec: f.acodec,
					url: f.url ? 'HAS_URL' : 'NO_URL'
				})))
				console.log('======================')

				resolve(info)
			} catch (error) {
				reject(new Error(`Failed to parse yt-dlp output: ${String(error)}`))
			}
		})
	})

export const downloadFromInfo = (
	info: YouTubeDLInfo,
	output: string,
	args: string[] = [],
	onProgress?: (progress: string) => void
): { stdout: Readable } => {

	console.log('=== DOWNLOAD ARGS ===')
	console.log('yt-dlp args:', [
		"--newline",
		"--no-playlist",
		"-o",
		output,
		...args,
		info.webpage_url || info.url || "",
	])
	console.log('====================')

	const process = spawn("yt-dlp", [
		"--newline",  // Выводить прогресс построчно для легкого парсинга
		"--no-playlist",
		//"--merge-output-format", "mp4",
		"--postprocessor-args",
		"ffmpeg: -c:v libx265 -crf 23  preset medium -c:a aac -b:a 128k -tag:v hvc1 -movflags +faststart",
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