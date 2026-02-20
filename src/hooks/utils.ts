// src/hooks/utils.ts
import * as crypto from "crypto"

export function computeContentHash(content: string): string {
	return crypto.createHash("sha256").update(content).digest("hex")
}

export function classifyMutation(diff: string): "AST_REFACTOR" | "INTENT_EVOLUTION" {
	// Simple heuristic: If diff is mostly whitespace/syntax, refactor; else evolution
	return diff.trim().length < 100 ? "AST_REFACTOR" : "INTENT_EVOLUTION" // Improve with AST parser like @babel/parser
}
