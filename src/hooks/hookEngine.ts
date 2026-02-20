// src/hooks/hookEngine.ts

import * as fs from "fs"
import * as path from "path"
import * as yaml from "js-yaml"
import * as crypto from "crypto"
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"

// ──────────────────────────────────────────────────────────────
// Utility functions (you can also move them to hooks/utils.ts)

function computeContentHash(content: string): string {
	return crypto.createHash("sha256").update(content).digest("hex")
}

// Very simple heuristic classification (can be improved with real diff/AST later)
function classifyMutation(before: string, after: string): "AST_REFACTOR" | "INTENT_EVOLUTION" {
	const diffLength = Math.abs(before.length - after.length)
	const lineCountChange = before.split("\n").length - after.split("\n").length
	if (diffLength < 300 && Math.abs(lineCountChange) < 10) {
		return "AST_REFACTOR"
	}
	return "INTENT_EVOLUTION"
}

// ──────────────────────────────────────────────────────────────

export class HookEngine {
	private activeIntentId: string | null = null
	private activeIntent: any = null // cached selected intent object

	/**
	 * Called before a tool is executed.
	 * Main responsibilities:
	 * - Enforce intent selection (gatekeeper)
	 * - Load & inject context when select_active_intent is called
	 * - Scope validation
	 * - HITL approval for destructive actions
	 * - Concurrency / stale file check
	 */
	preHook(toolName: string, args: any, payload: any = {}): { modifiedPayload?: any; error?: any } {
		// ─── Gatekeeper: most tools require an active intent ───────────────────────
		if (toolName !== "select_active_intent" && !this.activeIntentId) {
			throw new Error("You must call select_active_intent with a valid Intent ID first.")
		}

		// ─── Handle intent selection ──────────────────────────────────────────────
		if (toolName === "select_active_intent") {
			if (!args.intent_id) {
				throw new Error("intent_id is required")
			}

			const intentsPath = path.join(process.cwd(), ".orchestration", "active_intents.yaml")
			if (!fs.existsSync(intentsPath)) {
				throw new Error("active_intents.yaml not found in .orchestration/")
			}

			const data = yaml.load(fs.readFileSync(intentsPath, "utf8")) as { active_intents: any[] }
			const selected = data.active_intents.find((i) => i.id === args.intent_id)

			if (!selected) {
				throw new Error(`Intent not found: ${args.intent_id}`)
			}

			this.activeIntentId = args.intent_id
			this.activeIntent = selected

			// Build context block to inject into prompt
			const context = {
				intent_id: selected.id,
				name: selected.name,
				constraints: selected.constraints || [],
				owned_scope: selected.owned_scope || [],
				acceptance_criteria: selected.acceptance_criteria || [],
			}

			const xmlBlock = `<intent_context>${JSON.stringify(context, null, 2)}</intent_context>`

			// Inject into the prompt payload (assumes payload has .prompt or .messages)
			if (payload && typeof payload === "object") {
				if (payload.prompt) {
					payload.prompt += `\n\n${xmlBlock}`
				} else if (Array.isArray(payload.messages)) {
					// Anthropic / OpenAI style messages
					payload.messages.push({
						role: "system",
						content: xmlBlock,
					})
				}
			}

			return { modifiedPayload: payload }
		}

		// ─── Scope enforcement (Phase 2) ──────────────────────────────────────────
		if (this.activeIntent && ["write_to_file", "delete_file", "execute_command"].includes(toolName)) {
			const targetPath = args.path || args.file || args.filename
			if (targetPath) {
				const allowed = this.activeIntent.owned_scope?.some((pattern: string) => {
					const regex = new RegExp(
						pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
					)
					return regex.test(targetPath)
				})

				if (!allowed) {
					throw new Error(
						`Scope Violation: Intent ${this.activeIntentId} is not allowed to modify ${targetPath}`,
					)
				}
			}
		}

		// ─── Human-in-the-loop approval for destructive actions (Phase 2) ─────────
		if (["write_to_file", "delete_file"].includes(toolName)) {
			const choice = vscode.window.showWarningMessage(
				`Allow AI to ${toolName.replace("_", " ")} ${args.path || "(unknown file)"}?`,
				"Approve",
				"Reject",
			)

			if (choice.then) {
				// It's a Thenable — wait for user
				return choice.then((selected) => {
					if (selected !== "Approve") {
						return { error: { type: "tool-error", message: "User rejected change" } }
					}
					return {}
				}) as any
			}
		}

		// ─── Concurrency control / stale file check (Phase 4) ─────────────────────
		if (toolName === "write_to_file") {
			const targetPath = args.path
			if (!targetPath) {
				throw new Error("path is required for write_to_file")
			}

			const fullPath = path.resolve(process.cwd(), targetPath)

			if (!args.initial_hash) {
				// We can make it optional or required depending on strictness
				console.warn("[HookEngine] No initial_hash provided → skipping stale check")
			} else {
				let currentContent = ""
				try {
					currentContent = fs.readFileSync(fullPath, "utf8")
				} catch (err: any) {
					if (err.code === "ENOENT") {
						// New file — only allow if initial_hash signals new file
						if (args.initial_hash !== "new-file") {
							throw new Error("File does not exist, but initial_hash was provided")
						}
					} else {
						throw err
					}
				}

				const currentHash = computeContentHash(currentContent)

				if (currentHash !== args.initial_hash && args.initial_hash !== "new-file") {
					throw new Error("Stale File: Conflict detected. File content has changed since you last read it.")
				}
			}
		}

		return {}
	}

	/**
	 * Called after a tool has been successfully executed
	 * Main responsibility: record traceability (agent_trace.jsonl)
	 */
	postHook(toolName: string, args: any, result: any): void {
		if (toolName !== "write_to_file" || !this.activeIntentId) {
			return
		}

		const targetPath = args.path
		const fullPath = path.resolve(process.cwd(), targetPath)

		let newContent = args.content
		if (!newContent && fs.existsSync(fullPath)) {
			newContent = fs.readFileSync(fullPath, "utf8")
		}

		if (!newContent) {
			console.warn("[HookEngine] Could not determine new content for tracing")
			return
		}

		const contentHash = computeContentHash(newContent)

		// Try to get old content for classification (best effort)
		let oldContent = ""
		try {
			oldContent = fs.readFileSync(fullPath, "utf8") // note: this is after write
		} catch {}

		const mutation_class = classifyMutation(oldContent, newContent)

		const traceEntry = {
			id: uuidv4(),
			timestamp: new Date().toISOString(),
			vcs: {
				revision_id: "HEAD", // ← improve: use git rev-parse HEAD via child_process
			},
			files: [
				{
					relative_path: targetPath,
					conversations: [
						{
							url: "session-placeholder", // ← improve with real session id
							contributor: {
								entity_type: "AI",
								model_identifier: "claude-3-5-sonnet", // ← make dynamic if possible
							},
							ranges: [
								{
									start_line: args.start_line || 1,
									end_line: args.end_line || newContent.split("\n").length,
									content_hash: contentHash,
								},
							],
							related: [
								{
									type: "specification",
									value: this.activeIntentId,
								},
							],
						},
					],
				},
			],
		}

		const tracePath = path.join(process.cwd(), ".orchestration", "agent_trace.jsonl")
		const dir = path.dirname(tracePath)

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}

		fs.appendFileSync(tracePath, JSON.stringify(traceEntry) + "\n")
	}

	// Helper: reset state (useful for new sessions)
	reset() {
		this.activeIntentId = null
		this.activeIntent = null
	}
}
