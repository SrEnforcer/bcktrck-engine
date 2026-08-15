---
applyTo: "**"
---

# TSF++ MCP usage

Use `@tsfpp/mcp-server` tools as the authoritative source for TSF++ rules and API surface.

## Priority rules

- DEVIATION comments: always call `get_deviation({ ruleId, reason })` and use the output verbatim.
- Mechanical rule checks: call `check_pattern({ code })` for deterministic scans.
- Full package exports and signatures: call `get_api_surface({ package })`.

When tool output and memory differ, tool output governs.

## Tool routing

- Rule lookup by id: `get_rule({ id })`
- Rule lookup by concept: `search_rules({ query })`
- Layer constraints: `get_layer({ layer })`
- Canonical patterns: `get_pattern({ concept })`
- DEVIATION formatting: `get_deviation({ ruleId, reason })`
- Mechanical compliance scan: `check_pattern({ code })`
- API surface lookup: `get_api_surface({ package })`

## Available resources

- TSF++ coding standard rules and layer constraints
- Canonical TSF++ patterns
- DEVIATION formatter
- Mechanical rule checker
- `@tsfpp/prelude` API surface
- `@tsfpp/boundary` API surface