// In AgentLoop.ts or tool handler
import { HookEngine } from "../hooks/hookEngine"
const hook = new HookEngine()
const { modifiedPayload } = hook.preHook(toolName, args, originalPayload)
// Use modifiedPayload for LLM/tool call
