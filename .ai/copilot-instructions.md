# AI Instructies

This project uses centralized AI sources with a universal, implementation-agnostic layout.

## MCP tools

A `@tsfpp/mcp-server` is connected. It provides authoritative, version-accurate
access to the TSF++ standard and package API surfaces.

Use MCP tools — not memory, not skills — for:
- Rule lookups: `get_rule`, `get_layer`, `search_rules`
- Canonical patterns: `get_pattern`
- DEVIATION comments: `get_deviation` (always — never hand-write)
- Mechanical validation: `check_pattern`
- Package API surface: `get_api_surface`

Skills and instructions provide hot-path shortcuts. MCP tools provide authority.
When they conflict, the MCP tool output governs.

Canonical source locations in a bootstrapped project:

- Root guidance: `ai.md`
- Copilot root guidance: `.ai/copilot-instructions.md`
- Agents: `.ai/agents/`
- Skills: `.ai/skills/`
- Instructions: `.ai/instructions/`
- Prompts: `.ai/prompts/`

Editor-specific compatibility files are generated in `.github/`.
In bootstrapped projects, edit the `.ai/` sources instead of generated compatibility files.

Root guidance for always-on systems lives here. Keep this file in English.