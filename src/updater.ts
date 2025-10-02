import { spawn } from "node:child_process"
import { Cron } from "croner"
import { YTDL_AUTOUPDATE } from "./environment"

export class Updater {
	public readonly enabled = YTDL_AUTOUPDATE
	public updating: Promise<void> | false = false

	#job: Cron | null = null

	constructor() {
		console.log("Auto-update is", this.enabled ? "enabled" : "disabled")
		if (!this.enabled) return

		this.#job = new Cron("20 4 * * *", this.update)

		console.log("Next update scheduled at", this.#job.nextRun())
	}

	update = async () => {
		this.updating = this.#update()
		await this.updating
		this.updating = false
	}

	async #update() {
		console.log("updating youtube-dl")

		try {
			const { stdout, stderr, code } = await this.#spawnAndWait("youtube-dl", ["-U"])
			if (code && code !== 0) {
				throw new Error(stderr.trim() || `youtube-dl exited with code ${code}`)
			}
			if (stdout.trim().length) console.log(stdout.trim())
			console.log("youtube-dl updated")
		} catch (error) {
			if (error instanceof Error) {
				console.error("youtube-dl update failed")
				console.error(error.message)
			} else {
				console.error("youtube-dl update failed")
				console.error(String(error))
			}
		} finally {
			if (this.#job) {
				console.log("Next update scheduled at", this.#job.nextRun())
			}
		}
	}

	#spawnAndWait(cmd: string, args: string[]) {
		return new Promise<{ stdout: string; stderr: string; code: number | null }>(
			(resolve, reject) => {
				const child = spawn(cmd, args)
				let stdout = ""
				let stderr = ""

				child.stdout.on("data", (d) => (stdout += d.toString()))
				child.stderr.on("data", (d) => (stderr += d.toString()))

				child.once("error", (err) => reject(err))
				child.once("close", (code) => resolve({ stdout, stderr, code }))
			},
		)
	}
}