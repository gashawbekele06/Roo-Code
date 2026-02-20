// src/tools/fileTools.ts
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { HookEngine } from "../hooks/hookEngine"
import { computeContentHash } from "../hooks/hookEngine" // or move to utils

export const writeFileTool = {
	name: "write_file",
	description:
		"Write or replace file content. Requires intent_id, mutation_class, and initial_hash for traceability and concurrency safety.",

	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Relative path from workspace root" },
			content: { type: "string", description: "Full new file content" },
			line_count: { type: "number", description: "Line count of content (validation)" },
			intent_id: { type: "string", description: "Active intent ID (required)" },
			mutation_class: {
				type: "string",
				enum: ["AST_REFACTOR", "INTENT_EVOLUTION"],
				description: "Change type: AST_REFACTOR = syntax/style, INTENT_EVOLUTION = new behavior",
			},
			initial_hash: {
				type: "string",
				description: 'SHA-256 hash of file before change (or "new-file" for creation)',
			},
		},
		required: ["path", "content", "line_count", "intent_id", "mutation_class"],
		additionalProperties: false,
	},

	async execute(args: any) {
		const hook = new HookEngine()

		try {
			const preResult = hook.preHook("write_file", args, {})
			if (preResult.error) return preResult.error

			const workspace = vscode.workspace.workspaceFolders?.[0]
			if (!workspace) throw new Error("No workspace open")

			const uri = vscode.Uri.joinPath(workspace.uri, args.path)
			const edit = new vscode.WorkspaceEdit()

			edit.replace(uri, new vscode.Range(0, 0, Infinity, Infinity), args.content)

			const success = await vscode.workspace.applyEdit(edit)
			if (!success) throw new Error("Workspace edit failed")

			const doc = await vscode.workspace.openTextDocument(uri)
			await doc.save()

			hook.postHook("write_file", args, { success: true })

			return {
				success: true,
				message: `File ${args.path} ${fs.existsSync(uri.fsPath) ? "updated" : "created"}.`,
				content_hash: computeContentHash(args.content),
			}
		} catch (err: any) {
			return {
				success: false,
				error: {
					type: "tool-error",
					message: err.message,
					code: "WRITE_FAILED",
				},
			}
		}
	},
}
