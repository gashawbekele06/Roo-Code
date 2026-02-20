// src/tools/intentTools.ts
import { HookEngine } from "../hooks/hookEngine"

export const selectActiveIntent = {
	name: "select_active_intent",
	description:
		"MANDATORY first tool: Select an active intent to load curated context (constraints, scope). Call this before any action.",
	parameters: {
		type: "object",
		properties: {
			intent_id: { type: "string", description: "Valid ID from active_intents.yaml (e.g., INT-001)" },
		},
		required: ["intent_id"],
	},
	execute: (args, payload) => {
		const hook = new HookEngine()
		return hook.preHook("select_active_intent", args, payload)
	},
}

// Register in toolRegistry.ts: tools.push(selectActiveIntent);
