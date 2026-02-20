// src/tools/intentTools.ts
import { HookEngine } from "../hooks/hookEngine"

export const selectActiveIntent = async (args: { intent_id: string }, payload: any) => {
	const hook = new HookEngine()
	const { result } = hook.preHook("select_active_intent", args, payload)
	return result || `Selected intent ${args.intent_id} with context injected.`
}
