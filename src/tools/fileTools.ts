// src/tools/fileTools.ts
const writeFile = {
	// ... existing
	parameters: {
		type: "object",
		properties: {
			// Existing path, content...
			intent_id: { type: "string" },
			mutation_class: { type: "string", enum: ["AST_REFACTOR", "INTENT_EVOLUTION"] },
		},
		required: ["intent_id", "mutation_class"], // Add to array
	},
	execute: (args, payload) => {
		const hook = new HookEngine()
		hook.preHook("write_file", args, payload)
		// Write logic...
		hook.postHook("write_file", args, result)
	},
}
