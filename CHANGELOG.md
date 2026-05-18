# Changelog

All notable changes to this project will be documented in this file.
This file is maintained automatically by [release-please](https://github.com/googleapis/release-please)
and supplemented during development via the `/trunk-changelog` prompt.

<!-- do not remove this comment - release-please uses it as an anchor -->
<!-- RELEASE-PLEASE-INSERTION-POINT -->

## [Unreleased]

### Tests
- `test(core): replace mock-based pipeline tests with integration scenarios` — Improves regression confidence by exercising parse, resolve, and render behavior through real module boundaries.

### Documentation
- `docs(core): add TSF++ module and export documentation across src` — Expands API and module documentation to improve discoverability and maintainability for contributors.

### Chores
- `chore(tooling): upgrade TSF++ agents and standard dependencies` — Aligns local tooling and rule enforcement with newer TSF++ releases for development-time consistency.
- `chore(repo): migrate release-please manifest to canonical path` — Restores release automation compatibility by using the expected manifest filename for trunk release workflows.
