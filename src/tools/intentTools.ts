// src/tools/intentTools.ts
import { HookEngine } from "../hooks/hookEngine"

export const selectActiveIntentTool = {
	name: "select_active_intent",
	description:
		"MANDATORY FIRST STEP: Select an active intent by ID to load curated context (constraints and scope only). " +
		"You MUST call this tool before any mutating operation (write_file, execute_command, etc.). " +
		'If no matching intent exists for the request, respond with: "No valid intent found - please clarify or create one."',

	parameters: {
		type: "object",
		properties: {
			intent_id: {
				type: "string",
				description: "Valid intent ID from .orchestration/active_intents.yaml (format: INT-###)",
			},
		},
		required: ["intent_id"],
		additionalProperties: false,
	},

	execute: async (args: { intent_id: string }, context: any) => {
		const hook = new HookEngine()
		try {
			const result = hook.preHook("select_active_intent", args, context)
			if (result.error) {
				return result.error
			}
			return {
				success: true,
				message: `Intent ${args.intent_id} selected. Curated context injected.`,
				injected_context:
					result.modifiedPayload?.prompt?.match(/<intent_context>[\s\S]*?<\/intent_context>/)?.[0] || "",
			}
		} catch (err: any) {
			return {
				success: false,
				error: {
					type: "tool-error",
					message: err.message,
					code: "INTENT_SELECTION_FAILED",
				},
			}
		}
	},
}
