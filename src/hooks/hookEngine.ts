// src/hooks/hookEngine.ts
import * as fs from "fs"
import * as path from "path"
import * as yaml from "js-yaml"
import { v4 as uuidv4 } from "uuid" // For future use

export class HookEngine {
	private activeIntentId: string | null = null

	preHook(toolName: string, args: any, payload: any) {
		if (toolName === "select_active_intent") {
			const intentsPath = path.join(process.cwd(), ".orchestration", "active_intents.yaml")
			if (!fs.existsSync(intentsPath)) throw new Error("active_intents.yaml not found")
			const intents = yaml.load(fs.readFileSync(intentsPath, "utf8")) as { active_intents: any[] }
			const selected = intents.active_intents.find((i) => i.id === args.intent_id)
			if (!selected) throw new Error(`Invalid Intent ID: ${args.intent_id}`)
			this.activeIntentId = args.intent_id
			const context = {
				constraints: selected.constraints,
				scope: selected.owned_scope,
			}
			const xmlBlock = `<intent_context>${JSON.stringify(context)}</intent_context>`
			// Inject into prompt payload (assume payload has 'prompt' field)
			if (payload && payload.prompt) payload.prompt += `\n${xmlBlock}`
			return { result: xmlBlock, modifiedPayload: payload }
		}
		// Gatekeeper for other tools
		if (!this.activeIntentId) throw new Error("You must cite a valid active Intent ID.")
		return { result: null, modifiedPayload: payload }
	}

	private commandType(toolName: string): "safe" | "destructive" {
		const destructive = ["write_to_file", "delete_file", "execute_command"] // Expand as needed
		return destructive.includes(toolName) ? "destructive" : "safe"
	}

	preHook(toolName: string, args: any, payload: any) {
		// Existing code...
		if (this.commandType(toolName) === "destructive") {
			// Scope enforcement
			const intentsPath = path.join(process.cwd(), ".orchestration", "active_intents.yaml")
			const intents = yaml.load(fs.readFileSync(intentsPath, "utf8")) as { active_intents: any[] }
			const intent = intents.active_intents.find((i) => i.id === this.activeIntentId)
			if (
				!intent ||
				!intent.owned_scope.some((scope) => args.path?.match(new RegExp(scope.replace(/\*\*/g, ".*"))))
			) {
				throw new Error(`Scope Violation: ${this.activeIntentId} not authorized for ${args.path}`)
			}
			// HITL authorization (use VS Code API)
			const vscode = require("vscode") // Assume imported
			const choice = await vscode.window.showWarningMessage(
				`Approve ${toolName} on ${args.path}?`,
				"Approve",
				"Reject",
			)
			if (choice !== "Approve") {
				return { error: { type: "tool-error", message: "User rejected" } } // For autonomous recovery
			}
		}
		// .intentignore check (simple impl)
		const ignorePath = path.join(process.cwd(), ".intentignore")
		if (
			fs.existsSync(ignorePath) &&
			fs
				.readFileSync(ignorePath, "utf8")
				.split("\n")
				.some((line) => args.path?.includes(line.trim()))
		) {
			throw new Error(`Ignored by .intentignore: ${args.path}`)
		}
		return { result: null, modifiedPayload: payload }
	}

	// Placeholder for postHook (expand in Phase 3)
	postHook(toolName: string, args: any, result: any) {}
}
