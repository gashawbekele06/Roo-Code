# ARCHITECTURE_NOTES.md

## Phase 0: The Archaeological Dig

1. **Fork & Run**

    - Forked from https://github.com/RooCodeInc/Roo-Code
    - Extension activates in VS Code via `npm run dev` → F5 debug session
    - Commands: "Roo Code: Start Chat" opens Webview chat panel
    - Tested with Claude-3.5-Sonnet model integration

2. **Trace the Tool Loop**

    - Main agent execution loop: `src/agent/AgentLoop.ts` (processes user prompt → tool calls → response)
    - Tool registration/dispatch: `src/tools/toolRegistry.ts` (tools pushed to array/map)
    - `execute_command`: General runner in `src/tools/commandTool.ts`
    - `write_to_file`: File mutation in `src/tools/fileTools.ts` (uses VS Code WorkspaceEdit for undoable writes)

3. **Locate the Prompt Builder**

    - System prompt construction: `src/prompt/PromptBuilder.ts` (combines system instructions, history, context)
    - Modified to enforce strict mandate: "You MUST call select_active_intent before any mutating action"

4. **Architectural Decisions (Overall)**
    - **Middleware Pattern**: All hooks isolated in `src/hooks/hookEngine.ts` as a composable pipeline (array of pre-hook functions) → separation of concerns, easy to add new hooks (e.g., logging) without core changes
    - **Sidecar Storage**: `.orchestration/` uses YAML + JSONL → human-readable, no DB overhead in VS Code extension, sufficient for traceability
    - **Fail-Safety**: Try-catch in pipeline → structured errors returned to agent (self-correction) instead of crashing
    - **Content Hashing**: SHA-256 on modified block → spatial independence (line shifts don't break trace)
    - **Mutation Classification**: Simple diff heuristic (size/line change) → lightweight, no AST parser deps

**High-Level Flow Diagram (ASCII)**

User Prompt
↓
PromptBuilder (adds mandate: MUST call select_active_intent first)
↓
Agent → calls select_active_intent(intent_id)
↓
Pre-Hook Pipeline (gatekeeper → scope → .intentignore → HITL → stale check)
│
├─ select_active_intent → load active_intents.yaml → curate <intent_context> → inject into prompt
│
└─ Destructive tool without intent → structured error {type: 'intent-required'}
↓
Tool Execution (e.g. write_file)
↓
Post-Hook → hash content → classify (AST_REFACTOR / INTENT_EVOLUTION) → append to agent_trace.jsonl
↓
Artifacts updated (.orchestration/ files)

## Phase 1: The Handshake (Reasoning Loop)

- **Goal**: Enforce two-stage state machine — intent selection mandatory before action
- **Key Implementation**:
    - New tool `select_active_intent` in `src/tools/intentTools.ts` (registered in toolRegistry)
    - System prompt mandate in `PromptBuilder.ts`: "You MUST NOT mutate until select_active_intent called"
    - Pre-hook intercepts → loads active_intents.yaml → curates only constraints/scope → injects XML block
    - Gatekeeper blocks any destructive tool if no active intent selected
- **Result**: Agent cannot bypass handshake; context is curated (not full dump)

## Phase 2: Hook Middleware & Security Boundary

- **Goal**: Clean, composable middleware with privilege separation
- **Key Implementation**:
    - `hookEngine.ts` uses pipeline of pre-hook functions (gatekeeper, scopeEnforcer, intentIgnoreChecker, hitlApprover)
    - Command classification: safe vs destructive (based on tool name)
    - Scope enforcement: regex match against owned_scope
    - .intentignore: simple pattern exclusion
    - HITL: VS Code warning message for destructive actions (Approve/Reject)
- **Result**: Hooks isolated/composable; fail-safe (structured errors); no core loop changes

## Phase 3: AI-Native Git Layer (Traceability)

- **Goal**: Verifiable ledger linking intent → code change via hash
- **Key Implementation**:
    - write_file schema requires `intent_id` + `mutation_class`
    - Post-hook: computes SHA-256 hash, simple heuristic classification, appends to `.orchestration/agent_trace.jsonl`
    - Trace schema: UUID, timestamp, vcs.revision, file path, ranges with content_hash, related intent_id
- **Result**: Automatic, spatial-independent traceability; golden thread from handshake to trace

## Phase 4: Parallel Orchestration (Master Thinker)

- **Goal**: Concurrency control + shared brain
- **Key Implementation**:
    - Pre-hook stale check: compares provided initial_hash vs current file hash
    - record_lesson tool in `lessonTools.ts`: appends to AGENTS.md on failures/decisions
    - Shared brain (AGENTS.md): lessons/rules across parallel agents
    - Optimistic locking: blocks write on conflict → agent re-reads
- **Result**: Demonstrated parallel chats with conflict detection; shared knowledge prevents drift

This document reflects the **final implemented system** as of February 21, 2026.  
All features tested in local VS Code: handshake enforced, trace generated, concurrency blocked, artifacts machine-managed.
