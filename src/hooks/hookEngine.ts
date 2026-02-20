// src/hooks/hookEngine.ts
import * as fs from "fs"
import * as path from "path"
import * as yaml from "js-yaml"
import * as crypto from "crypto"
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"

type PreHookFunction = (toolName: string, args: any, payload: any) => void

function computeContentHash(content: string): string {
	return crypto.createHash("sha256").update(content).digest("hex")
}

function simpleMutationClass(before: string, after: string): "AST_REFACTOR" | "INTENT_EVOLUTION" {
	const diffSize = Math.abs(before.length - after.length)
	const linesBefore = before.split("\n").length
	const linesAfter = after.split("\n").length
	const lineDiff = Math.abs(linesBefore - linesAfter)

	if (diffSize < 400 && lineDiff < 15) {
		return "AST_REFACTOR"
	}
	return "INTENT_EVOLUTION"
}

export class HookEngine {
	private activeIntentId: string | null = null
	private activeIntent: any = null

	private preHooks: PreHookFunction[] = [
		this.gatekeeper.bind(this),
		this.scopeEnforcer.bind(this),
		this.intentIgnoreChecker.bind(this),
		this.hitlApprover.bind(this),
		this.staleFileChecker.bind(this),
	]

	preHook(toolName: string, args: any, payload: any = {}) {
		try {
			// Run composable pre-hooks
			for (const hookFn of this.preHooks) {
				hookFn(toolName, args, payload)
			}

			// Special handling: intent selection + curated context injection
			if (toolName === "select_active_intent") {
				if (!args.intent_id) throw new Error("intent_id is required")

				const intentsPath = path.join(process.cwd(), ".orchestration", "active_intents.yaml")
				if (!fs.existsSync(intentsPath)) throw new Error("active_intents.yaml not found")

				const data = yaml.load(fs.readFileSync(intentsPath, "utf8")) as { active_intents: any[] }
				const selected = data.active_intents.find((i) => i.id === args.intent_id)

				if (!selected) throw new Error(`Intent not found: ${args.intent_id}`)

				this.activeIntentId = args.intent_id
				this.activeIntent = selected

				const curatedContext = {
					intent_id: selected.id,
					name: selected.name,
					constraints: selected.constraints || [],
					owned_scope: selected.owned_scope || [],
				}

				const xmlBlock = `<intent_context>${JSON.stringify(curatedContext, null, 2)}</intent_context>`

				// Inject into prompt (supports both flat prompt and messages array)
				if (payload.prompt) {
					payload.prompt += `\n\n${xmlBlock}`
				} else if (Array.isArray(payload.messages)) {
					payload.messages.push({ role: "system", content: xmlBlock })
				}

				return { modifiedPayload: payload }
			}

			return { modifiedPayload: payload }
		} catch (err: any) {
			console.error("[HookEngine] Pre-hook error:", err)
			return {
				error: {
					type: "hook-error",
					message: err.message,
					code: "PRE_HOOK_FAILED",
				},
			}
		}
	}

	postHook(toolName: string, args: any, result: any) {
		if (toolName !== "write_file" || !this.activeIntentId || !result?.success) return

		try {
			const filePath = path.resolve(process.cwd(), args.path)
			const newContent = args.content || fs.readFileSync(filePath, "utf8")

			const contentHash = computeContentHash(newContent)

			// Attempt to get old content (best effort - assumes initial_hash was provided)
			let oldContent = ""
			if (args.initial_hash && fs.existsSync(filePath)) {
				oldContent = fs.readFileSync(filePath, "utf8") // note: this is after write
			}

			const mutation_class = simpleMutationClass(oldContent, newContent)

			const traceEntry = {
				id: uuidv4(),
				timestamp: new Date().toISOString(),
				vcs: { revision_id: "HEAD" }, // improve later with git command
				files: [
					{
						relative_path: args.path,
						conversations: [
							{
								url: "session-placeholder",
								contributor: { entity_type: "AI", model_identifier: "claude-3-5-sonnet" },
								ranges: [
									{
										start_line: 1,
										end_line: newContent.split("\n").length,
										content_hash: contentHash,
									},
								],
								related: [{ type: "specification", value: this.activeIntentId }],
							},
						],
					},
				],
				mutation_class,
			}

			const tracePath = path.join(process.cwd(), ".orchestration", "agent_trace.jsonl")
			fs.mkdirSync(path.dirname(tracePath), { recursive: true })
			fs.appendFileSync(tracePath, JSON.stringify(traceEntry) + "\n")
		} catch (err) {
			console.error("[HookEngine] Post-hook trace failed:", err)
		}
	}

	// ─── Composable pre-hook functions ────────────────────────────────────────

	private gatekeeper(toolName: string) {
		if (this.classify(toolName) === "destructive" && !this.activeIntentId) {
			throw new Error("Intent required before destructive action")
		}
	}

	private scopeEnforcer(toolName: string, args: any) {
		if (this.classify(toolName) !== "destructive" || !args.path) return
		const allowed = this.activeIntent?.owned_scope?.some(
			(p: string) =>
				args.path.startsWith(p.replace("/**", "")) || new RegExp(p.replace(/\*\*/g, ".*")).test(args.path),
		)
		if (!allowed) throw new Error(`Scope violation: ${args.path} not in ${this.activeIntentId} scope`)
	}

	private intentIgnoreChecker(toolName: string, args: any) {
		if (!args.path) return
		const ignorePath = path.join(process.cwd(), ".intentignore")
		if (!fs.existsSync(ignorePath)) return
		const patterns = fs
			.readFileSync(ignorePath, "utf8")
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
		if (patterns.some((p) => args.path.includes(p))) {
			throw new Error(`File ignored by .intentignore: ${args.path}`)
		}
	}

	private async hitlApprover(toolName: string, args: any) {
		if (this.classify(toolName) !== "destructive") return
		const choice = await vscode.window.showWarningMessage(
			`Allow AI to ${toolName.replace(/_/g, " ")} ${args.path || "(unknown)"}?`,
			"Approve",
			"Reject",
		)
		if (choice !== "Approve") throw new Error("Change rejected by user")
	}

	private staleFileChecker(toolName: string, args: any) {
		if (toolName !== "write_file" || !args.initial_hash || !args.path) return

		const fullPath = path.resolve(process.cwd(), args.path)
		let currentContent = ""
		try {
			currentContent = fs.readFileSync(fullPath, "utf8")
		} catch (err: any) {
			if (err.code === "ENOENT" && args.initial_hash === "new-file") return
			throw err
		}

		const currentHash = computeContentHash(currentContent)
		if (currentHash !== args.initial_hash) {
			throw new Error("Stale File: Content changed since read. Re-read and retry.")
		}
	}

	private classify(toolName: string): "safe" | "destructive" {
		return ["write_file", "delete_file", "execute_command"].includes(toolName) ? "destructive" : "safe"
	}

	reset() {
		this.activeIntentId = null
		this.activeIntent = null
	}
}
