// src/hooks/hookEngine.ts (full, with Phase 2 enhancements)
import * as fs from "fs"
import * as path from "path"
import * as yaml from "js-yaml"
import * as vscode from "vscode"

// Pipeline for composability: array of pre-hook functions
type PreHookFn = (toolName: string, args: any, payload: any) => void

export class HookEngine {
	private preHooks: PreHookFn[] = [this.gatekeeper, this.scopeEnforcer, this.hitlApprover]
	private activeIntent: any = null

	// Run pipeline with fail-safety
	preHook(toolName: string, args: any, payload: any) {
		try {
			this.preHooks.forEach((hook) => hook(toolName, args, payload))
			// Context injection if applicable (from Phase 1)
			if (toolName === "select_active_intent") {
				const intents = yaml.load(fs.readFileSync(path.join(".orchestration", "active_intents.yaml"), "utf8"))
				this.activeIntent = intents.active_intents.find((i) => i.id === args.intent_id)
				if (!this.activeIntent) throw new Error("Invalid intent")
				const curated = `<intent_context>${JSON.stringify({ constraints: this.activeIntent.constraints, scope: this.activeIntent.owned_scope })}</intent_context>`
				payload.prompt += curated
			}
			// .intentignore check
			const ignorePatterns = fs.existsSync(".intentignore")
				? fs
						.readFileSync(".intentignore", "utf8")
						.split("\n")
						.filter((l) => l.trim())
				: []
			if (args.path && ignorePatterns.some((p) => args.path.includes(p)))
				throw new Error("Ignored by .intentignore")
		} catch (err) {
			console.error(err) // Log for fail-safety
			return { error: { type: "hook-failure", message: err.message } } // Structured error to agent
		}
		return { modifiedPayload: payload }
	}

	private gatekeeper(toolName: string, args: any) {
		if (this.classifyCommand(toolName) === "destructive" && !this.activeIntent) throw new Error("Intent required")
	}

	private scopeEnforcer(toolName: string, args: any) {
		if (this.classifyCommand(toolName) === "destructive" && args.path) {
			if (!this.activeIntent.owned_scope.some((s) => args.path.startsWith(s))) throw new Error("Scope violation")
		}
	}

	private async hitlApprover(toolName: string, args: any) {
		if (this.classifyCommand(toolName) === "destructive") {
			const choice = await vscode.window.showWarningMessage(
				`Approve ${toolName} on ${args.path}?`,
				"Approve",
				"Reject",
			)
			if (choice !== "Approve") throw new Error("Rejected by user")
		}
	}

	private classifyCommand(toolName: string): "safe" | "destructive" {
		return ["write_file", "execute_command"].includes(toolName) ? "destructive" : "safe"
	}

	// Post-hook placeholder for Phase 3
	postHook() {}
}

// Usage in agent loop: hook.preHook(toolName, args, payload)
