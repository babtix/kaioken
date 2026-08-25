Overview
The Hermes Agent concept introduces a continuous, self-reflective background agent model into 

Kaioken
. Inspired by Nous Research's Hermes architecture and Kaioken’s existing memory design (

cli/internal/memory/DESIGN.md
), Hermes operates both as an autonomous subagent executor and a continuous background knowledge worker.

Core Pillars
1. Per-Turn Reflection & Skill Distillation
Continuous Learning (×10 Hermes-style): Rather than summarizing only at session end, Hermes evaluates tool execution signals after every turn (e.g., error recovery, user corrections, multi-file edits).
Patching over Rewriting: Automatically updates existing .kaioken/ skills or synthesizes new skills (Origin: learned) without clobbering existing codebase knowledge.
2. Autonomous Daemon & Subagent Execution
Background Supervisor: Integrates with kaioken daemon to run long-running refactoring tasks, security audits, or test-fix loops asynchronously.
Tauri Desktop Visibility: Streams subagent state, intermediate thought processes, and real-time logs to the 

desktop
 UI wrapper.
3. Open-Weights & Local Model First
Hermes 3 / Open Model Optimization: Native prompt templates and tool-calling formatters tailored for local runners (vLLM, Ollama, Llama.cpp) and remote API endpoints.
Structured Tool Calling: Standardized fallback patterns for structured JSON/XML tool calls when operating on smaller open models.
Integration Architecture
mermaid
flowchart TD
    User([User / TUI / Desktop UI]) --> KaiokenCLI[Kaioken CLI Runner]
    KaiokenCLI --> HermesSubagent[Hermes Subagent Executor]
    HermesSubagent --> Tools[Tool System: Shell / Git / Files]
    HermesSubagent --> MemoryGate[Turn & Session Distillation Gate]
    MemoryGate --> KnowledgeBase[`.kaioken/` Knowledge Engine]
Affected Components
cli/internal/agent/: Subagent spawning and turn execution loop (

cli/internal/agent/agent.go
).
cli/internal/memory/: Memory distillation, heuristic trigger evaluation, and skill patcher (

cli/internal/memory/DESIGN.md
).
desktop/: Visual subagent monitor and memory stream inspector.
