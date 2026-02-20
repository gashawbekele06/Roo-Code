// src/tools/fileTools.ts
// (or src/core/tools/writeToFileTool.ts depending on your fork's structure)

import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { HookEngine } from "../hooks/hookEngine" // ← your Phase 1+ hook
import { computeContentHash } from "../hooks/utils" // ← your Phase 3 utility
import { ToolDefinition, ToolExecutionResult } from "../types/toolTypes" // adjust import path

// Optional: if your project has a diff provider
// import { diffViewProvider } from '../providers/DiffViewProvider';

export const writeToFileTool: ToolDefinition = {
	name: "write_to_file",
	description:
		"Write or completely replace the content of a file. Requires intent_id and mutation_class for traceability. Use only after selecting an active intent.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Relative path to the file (from workspace root).",
			},
			content: {
				type: "string",
				description: "The full new content to write to the file.",
			},
			line_count: {
				type: "number",
				description: "Number of lines in the provided content (including empty lines). Used for validation.",
			},
			// ──────────────────────────────────────────────────────────────
			// Required additions for TRP1 Challenge (Phase 3)
			intent_id: {
				type: "string",
				description:
					"The active intent ID this change belongs to (e.g. INT-001). Must match a selected intent.",
			},
			mutation_class: {
				type: "string",
				enum: ["AST_REFACTOR", "INTENT_EVOLUTION"],
				description:
					"Classify the change: AST_REFACTOR = syntax/style only (intent preserved), INTENT_EVOLUTION = new behavior/feature.",
			},
			// Optional but recommended for Phase 4 concurrency
			initial_hash: {
				type: "string",
				description: "SHA-256 hash of the file content BEFORE this change (for conflict detection).",
			},
		},
		required: ["path", "content", "line_count", "intent_id", "mutation_class"],
	},

	async execute(args: any): Promise<ToolExecutionResult> {
		const hook = new HookEngine()

		try {
			// ──────────────────────────────────────────────────────────────
			// Phase 2 + 3: Pre-hook (scope check, HITL, gatekeeper already in hook)
			const preResult = hook.preHook("write_to_file", args, {})
			if (preResult.error) {
				return { success: false, message: preResult.error.message }
			}

			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				throw new Error("No workspace folder open")
			}

			const fullPath = path.join(workspaceFolder.uri.fsPath, args.path)
			const dir = path.dirname(fullPath)

			// Create parent directories if needed
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}

			// ──────────────────────────────────────────────────────────────
			// Phase 4: Concurrency / stale check (optimistic locking)
			let currentHash: string | undefined
			if (args.initial_hash) {
				if (fs.existsSync(fullPath)) {
					const currentContent = fs.readFileSync(fullPath, "utf-8")
					currentHash = computeContentHash(currentContent)
					if (currentHash !== args.initial_hash) {
						throw new Error(
							"Stale File: Content has changed since you last read it. Re-read and try again.",
						)
					}
				} else if (args.initial_hash !== "new-file") {
					// convention for new files
					throw new Error("Stale File: File did not exist when you planned the change.")
				}
			}

			// ──────────────────────────────────────────────────────────────
			// Optional: Open diff view / approval (common in Roo-Code)
			// if (diffViewProvider) {
			//   await diffViewProvider.open(args.path, args.content);
			//   // Wait for user approval (this part depends on your fork's impl)
			//   // For simplicity, we assume approval happened or skip in challenge fork
			// }

			// Actual write using VS Code edit (safer, undoable)
			const edit = new vscode.WorkspaceEdit()
			const uri = vscode.Uri.file(fullPath)

			// Read current content for range (or replace whole file)
			let currentContent = ""
			try {
				currentContent = await vscode.workspace.fs.readFile(uri).then((b) => new TextDecoder().decode(b))
			} catch (e) {
				// file didn't exist → create new
			}

			edit.replace(uri, new vscode.Range(0, 0, currentContent.split("\n").length, 0), args.content)

			const success = await vscode.workspace.applyEdit(edit)
			if (!success) {
				throw new Error("Failed to apply workspace edit")
			}

			// Force save (optional)
			const doc = await vscode.workspace.openTextDocument(uri)
			await doc.save()

			// ──────────────────────────────────────────────────────────────
			// Phase 3: Post-hook – record traceability
			hook.postHook("write_to_file", args, { success: true })

			return {
				success: true,
				message: `File ${args.path} successfully ${fs.existsSync(fullPath) ? "updated" : "created"}.`,
				content_hash: computeContentHash(args.content), // for logging / return
				mutation_class: args.mutation_class,
			}
		} catch (error: any) {
			// Phase 2: Return standardized error for LLM autonomous recovery
			return {
				success: false,
				message: error.message || "Failed to write file",
				error: {
					type: "tool-error",
					code: "WRITE_FAILED",
					details: error.stack || "",
				},
			}
		}
	},
}
