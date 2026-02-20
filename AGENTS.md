# AGENTS.md – Shared Brain

Persistent knowledge base shared across all agent instances (Architect, Builder, Tester, Reviewer, etc.).  
All agents should read this file at the beginning of their context and append important lessons.

## Project-Wide Rules & Conventions

- Use 2-space indentation (never tabs)
- Prefer `async/await` over `.then()`
- Always use TypeScript strict mode
- File naming: kebab-case for directories, PascalCase for components/classes, camelCase for utilities/functions
- All API endpoints must have OpenAPI-style JSDoc comments
- No `any` type allowed (use `unknown` if truly dynamic)
- All mutating file operations must go through `write_to_file` tool (never direct fs writes)

## Coding Style Preferences

- Imports: group by type (standard libs → external → internal → relative)
- Prefer arrow functions for short callbacks
- Maximum line length: 100 characters
- Use early returns instead of deep nesting

## Lessons Learned

**2026-02-20 – Concurrency lesson**  
When multiple agents attempt to modify the same file simultaneously, stale file errors occur.  
Always read file → compute `initial_hash` → pass it to `write_to_file`. Never assume file content is static.

**2026-02-19 – Intent discipline**  
Agents frequently try to write code before calling `select_active_intent`.  
Strict prompt reinforcement + gatekeeper in HookEngine solved 90% of drift cases.

**2026-02-18 – Scope violation**  
Builder agent attempted to modify `src/config/env.ts` while working on INT-001 (Weather API).  
Added stricter regex scope matching in HookEngine.preHook → prevented unintended changes.

**2026-02-17 – Test feedback loop**  
When unit tests fail, agents now call `record_lesson` tool automatically → significantly faster convergence.

## Open Architectural Decisions

- Should we introduce a formal AST diff tool for better `mutation_class` detection?  
  → Currently using simple length heuristic. Considered @babel/parser but adds heavy dependency.

- Parallel agent coordination: currently relying on file-based locking via `initial_hash`.  
  → Future: consider SQLite in `.orchestration/state.db` for stronger consistency.

## How to Contribute

- When a verification/test step fails → append lesson here via `record_lesson` tool
- When a significant design decision is made → document it under "Architectural Decisions"
- Keep entries chronological and concise

Last significant update: 2026-02-20
