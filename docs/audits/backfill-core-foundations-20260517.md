## Backfill - src/resolver/attrs.ts

**Tests written:** 8
**Coverage added:**
- [x] `findStringAttrValue` - string attribute success path
- [x] `findStringAttrValue` - missing key returns `undefined`
- [x] `findStringAttrValue` - non-string attribute returns `undefined`
- [x] `findNumberAttrValue` - number attribute success path
- [x] `findNumberAttrValue` - non-number attribute returns `undefined`
- [x] `findHandleRefAttrValue` - `@handle` returns suffix
- [x] `findHandleRefAttrValue` - non-prefixed string returns `undefined`
- [x] Property: any `@${value}` string returns `${value}`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- `Array.prototype.find` internals in helper lookup are standard library behavior and not branch-addressable through public exports.

## Backfill - src/style/dsl-blocks.ts

**Tests written:** 4
**Coverage added:**
- [x] `extractTopLevelBlock` - missing keyword leaves source unchanged
- [x] `extractTopLevelBlock` - extracted region is blanked in stripped output
- [x] `extractTopLevelBlock` - extracted lines preserve original line/indent metadata
- [x] Property: stripped source preserves normalized line count

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal regex edge engine in `leadingIndent` is delegated to JavaScript `RegExp` runtime and is covered only through exported behavior.

## Backfill - src/subordinate-count-policy.ts

**Tests written:** 7
**Coverage added:**
- [x] `isCountedDirectSubordinate` - department candidates never count
- [x] `isCountedDirectSubordinate` - vacancy candidates honor `includeVacancies=false`
- [x] `isCountedDirectSubordinate` - vacancy candidates honor `includeVacancies=true`
- [x] `isCountedDirectSubordinate` - shadow candidates honor `includeShadows=false`
- [x] `isCountedDirectSubordinate` - employee candidates count when not shadow-blocked
- [x] `countDirectSubordinates` - mixed candidate set with policy filtering
- [x] Property: result is always in `[0, candidates.length]`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- `absurd` default branch in the exhaustive switch is unreachable by construction for the `SubordinateKind` union.

## Backfill - src/subtree.ts

**Tests written:** 7
**Coverage added:**
- [x] `listSubtrees` - pre-order traversal with depth and label normalization
- [x] `isolateSubtree` - success path returns `Some` with dotted-edge filtering
- [x] `isolateSubtree` - unknown id returns `None`
- [x] `isolateSubtrees` - all-unknown selection returns `None`
- [x] `isolateSubtrees` - mixed known/unknown selection keeps valid roots
- [x] `isolateSubtrees` - descendant selections are pruned when ancestor is selected
- [x] `isolateSubtrees` - multi-root selection under department root preserves selected members

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Synthetic root fallback branches that require impossible mixed-root shapes are guarded by internal construction invariants and not directly reachable from public inputs.

## Backfill - src/resolver/validate.ts

**Tests written:** 10
**Coverage added:**
- [x] `validateAstReferences` - duplicate handle diagnostics
- [x] `validateAstReferences` - unknown link handles with nearest suggestion
- [x] `validateAstReferences` - invalid staff side attribute
- [x] `validateAstReferences` - department missing head error
- [x] `validateAstReferences` - invalid non-handle department head
- [x] `validateAstReferences` - invalid shadow primary attribute
- [x] `validateAstReferences` - invalid shadow type attribute
- [x] `validateAstReferences` - invalid shadow side when type is `staff`
- [x] `validateAstReferences` - shadow primary cannot reference another shadow
- [x] `validateAstReferences` - valid references return an empty error list

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal Levenshtein memoization storage transitions are exercised indirectly via suggestion output and are not externally observable as standalone outputs.

## Backfill - src/lexer/tokenize.ts

**Tests written:** 8
**Coverage added:**
- [x] `tokenize` - keyword and display text tokenization for simple org declaration
- [x] `tokenize` - arrow and delimiter token classification
- [x] `tokenize` - mixed tabs/spaces on one line emits indentation error
- [x] `tokenize` - inconsistent indentation style across lines emits error
- [x] `tokenize` - invalid dedent level emits error
- [x] `tokenize` - unclosed string literal emits error token
- [x] `tokenize` - comments and blank lines preserve stream termination
- [x] Property: final token is always `eof`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Recursive helper internals (`processLines`, `tokenizeLine`, dedent recursion steps) are intentionally private and validated through public token stream behavior only.

## Backfill - src/parser/combinators.ts

**Tests written:** 16
**Coverage added:**
- [x] `map` - success path maps value and preserves rest
- [x] `map` - failure path returns source parser error
- [x] `seq` - success path returns tuple value
- [x] `seq` - first parser failure short-circuits with first error
- [x] `seq` - second parser failure is returned
- [x] `choice` - first successful alternative is returned
- [x] `choice` - all-failed path returns combined alternative error
- [x] `many` - immediate parser failure returns empty success
- [x] `many` - repeated consuming parser collects values
- [x] `many` - non-consuming parser returns loop-protection error
- [x] `opt` - success path returns `Some`
- [x] `opt` - failure path returns `None` and preserves input
- [x] `token` - matching token success path
- [x] `token` - mismatch returns expected-vs-actual error
- [x] `lazy` - factory-invoked parse path
- [x] Property: `token('identifier')` succeeds for any stream with identifier head

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Helper fallback utilities (`lineOrZero`, `colOrZero`, `tokenKindOrEof`) are covered through parser outcomes rather than direct non-exported invocation.

## Backfill - src/parser/parse.ts

**Tests written:** 3
**Coverage added:**
- [x] `parseBtl` - successful tokenize+parse path returns grammar parse result unchanged
- [x] `parseBtl` - grammar parse error path returns parser error unchanged
- [x] `parseBtl` - exception path wraps thrown error as `Parser exception: ...`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal `errorMessage` branches for every possible unknown object shape are partially observable only through wrapped exception text.

## Backfill - src/parse-and-resolve.ts

**Tests written:** 3
**Coverage added:**
- [x] `parseAndResolveBtl` - parse failure path returns `{ ok: false, parseError }`
- [x] `parseAndResolveBtl` - resolve failure path returns `{ ok: false, resolveErrors }`
- [x] `parseAndResolveBtl` - full success path returns `{ ok: true, ast, tree }`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Option default parameter object creation is not externally distinguishable beyond returned branch outcomes.

## Backfill - src/parser/grammar.ts

**Tests written:** 6
**Coverage added:**
- [x] `parse` - valid minimal org parses into root + child AST
- [x] `parse` - config + links sections parse into config pairs and links
- [x] `parse` - root-level staff entries are separated into `root.staffNodes`
- [x] `parse` - unknown layout hint kind returns parse error
- [x] `parse` - missing handle identifier after `@` returns parse error
- [x] `parse` - invalid attribute key token returns parse error

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Non-exported grammar helpers are covered only through the public `parse` orchestration output.

## Backfill - src/resolver/handles.ts

**Tests written:** 5
**Coverage added:**
- [x] `buildHandleMap` - unique explicit handles are mapped with no duplicates
- [x] `buildHandleMap` - duplicate explicit handles are reported in `duplicates`
- [x] `buildHandleMap` - auto slug generation with `_2` collision disambiguation
- [x] `buildHandleMap` - empty slug fallback to `node`
- [x] `buildHandleMap` - traversal includes staff nodes

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal helper recursion in `uniqueAutoHandle` is observable only through resulting assigned handle strings.

## Backfill - src/resolver/tree.ts

**Tests written:** 2
**Coverage added:**
- [x] `collectNodes` - recursive flattening includes children and staff branches in traversal order
- [x] `collectNodes` - leaf node returns singleton list

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- No additional uncovered paths; module exports a single pure recursive traversal with fully observable output.

## Backfill - src/resolver/resolve.ts

**Tests written:** 5
**Coverage added:**
- [x] `resolveAst` - validation failure path returns unknown-handle errors
- [x] `resolveAst` - success path builds tree children and dotted edges
- [x] `resolveAst` - suppressed dotted-edge styles (`none`) are omitted
- [x] `resolveAst` - shadow node extraction includes host and hideConnector for staff hidden shadows
- [x] `resolveAst` - variable substitution is applied in title composition

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal helpers (`toOrgNode`, `extractIconAttrs`, shadow-entry walkers) are private and exercised only via exported `resolveAst` outcomes.

## Backfill - src/layout/render-config-validation.ts

**Tests written:** 3
**Coverage added:**
- [x] `validateRenderConfig` - valid config returns `{ ok: true }`
- [x] `validateRenderConfig` - invalid numeric constraints produce field-specific errors
- [x] `validateRenderConfig` - invalid color/font/dash-array inputs produce field-specific errors

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Regex tokenization internals for color and dash-array parsing are verified through public validation results, not direct helper invocation.

## Backfill - src/layout/route-edges.ts

**Tests written:** 5
**Coverage added:**
- [x] `routeEdgesWithDiagnostics` - normal routing with all positions present
- [x] `routeEdgesWithDiagnostics` - hanging-hint route strategy branch
- [x] `routeEdgesWithDiagnostics` - missing child-position diagnostic branch
- [x] `routeEdgesWithDiagnostics` - missing parent-position diagnostic branch
- [x] `routeEdges` - style-map edge overrides (`edgeStyle`, `edgeWidth`) are propagated

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Floating-point tolerance helper behavior (`almostEqual`) is covered indirectly through route shape assertions.

## Backfill - src/compile.ts

**Tests written:** 4
**Coverage added:**
- [x] `compile` - defs/style extraction parse failure returns `parseError`
- [x] `compile` - unresolved `subtreeId` returns `unknown_handle` resolve error
- [x] `compile` - render-stage failure maps `RenderError` to `ResolveError`
- [x] `compile` - end-to-end happy path returns `{ ok: true, svg, viewBox }`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal helper boundaries (`buildCompileStyleContext`, `buildPlacementArtifacts`, icon-map internals) are private and covered through orchestrator outcomes.

## Backfill - src/layout/apply-layout-hints.ts

**Tests written:** 3
**Coverage added:**
- [x] `applyLayoutHints` - no-hint input preserves original positions
- [x] `applyLayoutHints` - `hanging-right` places child into right lane
- [x] `applyLayoutHints` - `hanging-both` splits sibling children to opposite sides

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Non-exported compaction helpers and subtree-shift internals are tested only through final returned positions.

## Backfill - src/layout/render-svg.ts

**Tests written:** 3
**Coverage added:**
- [x] `defaultRenderConfig` - verifies stable key defaults
- [x] `renderSvg` - validation-failure short-circuit branch
- [x] `renderSvg` - success path delegates to projection renderer

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Detailed section projection rendering is delegated to `render-svg/sections` and covered in that module’s own tests.

## Backfill - src/layout/index-tree.ts

**Tests written:** 3
**Coverage added:**
- [x] `indexTree` - employee indexing includes child ids, staff side ids, and staff label map
- [x] `indexTree` - department/vacancy kinds are indexed with parent and depth metadata
- [x] `indexTree` - optional layout and triangle hints are preserved in indexed nodes

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal walk/merge helpers are private and covered only through public `indexTree` output structure.

## Backfill - src/layout/staff-placement.ts

**Tests written:** 4
**Coverage added:**
- [x] `placeStaff` - places left/right staff around parent center
- [x] `placeStaff` - left-side ordering uses reverse declaration order for nearest-first placement
- [x] `placeStaff` - missing staff label falls back to id
- [x] `placeStaff` - missing parent position yields no staff placement entries

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Exact floating-point spacing internals are validated through relative placement assertions rather than strict pixel-equivalent snapshots.

## Backfill - src/layout/buchheim.ts

**Tests written:** 3
**Coverage added:**
- [x] `buchheim` - single-node tree places root at origin with depth-preserving y
- [x] `buchheim` - sibling ordering yields increasing x and correct depth row
- [x] `buchheim` - parent x centers between left and right child positions

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal scratch-state mutations and contour-thread bookkeeping are private implementation details covered through exported coordinate invariants.

## Backfill - src/layout/render-svg/shared.ts

**Tests written:** 7
**Coverage added:**
- [x] `escapeXml` and `gridToPixels` core helpers
- [x] Bounds helpers (`emptyRenderBounds`, `expandBoundsWithPoint`, `expandBoundsWithPoints`, `mergeRenderBounds`, `boundsFromRect`, `mergeAllBounds`)
- [x] Section merge helpers (`mergeSectionRender`, `mergeShadowBodyRender`)
- [x] Geometry lookup helpers (`getNodeBounds`, `getNodePosition`)
- [x] Style helpers (`getFillColor`, `mergeTextStyle`, `textAttrs`, `rectStrokeStyleAttrs`, `edgeStrokeStyleAttrs`, `strokeWidthAttr`)
- [x] `renderNodeIcons` single and stacked modes
- [x] `sanitizeRenderConfig` and `validatePlacedNodePositions` success/failure branches

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Low-level icon SVG path details are delegated to icon renderer internals and are asserted only by non-empty output contracts.

## Backfill - src/layout/render-svg/nodes.ts

**Tests written:** 3
**Coverage added:**
- [x] `buildStaffParentLookup` maps both left and right staff ids to parent ids
- [x] `renderNodeBodies` emits node body elements for positioned non-shadow nodes
- [x] `renderStaffBodies` emits staff body elements with lookup-based style fallback path

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal badge/triangle/icon fragment builders are private and validated through exported section output.

## Backfill - src/layout/render-svg/sections.ts

**Tests written:** 1
**Coverage added:**
- [x] `renderSvgProjection` orchestrates sub-renderers, assembles ordered SVG layers, and computes positive viewBox dimensions

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal section/dependency helper composition is private and tested through the single exported projection function.

## Backfill - src/layout/render-svg/dotted.ts

**Tests written:** 2
**Coverage added:**
- [x] `renderDottedEdges` renders dotted-edge polyline markup
- [x] Label rendering path emits escaped text content
- [x] Missing source/target bounds path skips element emission

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal route helper branches (`resolveDottedEndpoints`, spread/clamp details) are private and covered via exported render output invariants.

## Backfill - src/layout/render-svg/edges.ts

**Tests written:** 3
**Coverage added:**
- [x] `renderStaffConnectors` renders left/right staff connector lines for placed parents
- [x] `renderSolidEdges` routed mode renders polyline edges and skips staff-shadow targets
- [x] `renderSolidEdges` fallback mode renders parent-child line edges with style-map stroke options

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal staff lookup and connector-side reducers are private and verified through exported section output and bounds behavior.

## Backfill - src/layout/render-svg/shadows.ts

**Tests written:** 3
**Coverage added:**
- [x] `buildShadowBoundsMap` returns shadow id to computed bounds mapping
- [x] `renderShadowBodies` emits shadow body + connector for visible connectors
- [x] `renderShadowBodies` suppresses connector rendering when `hideConnector` is true

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal placement and attach-point math helpers are private and asserted through exported rendered SVG contracts.

## Backfill - src/layout/render-svg/text.ts

**Tests written:** 6
**Coverage added:**
- [x] `toTextStyle` extracts text-only style fields
- [x] `buildStyledLabelLines` splits name/title lines into semantic kinds
- [x] `composeShadowLabel` applies override title behavior
- [x] `fitFontSizeToBox` respects min and max budget constraints
- [x] `renderStyledLabelElement` single-line path emits plain `<text>`
- [x] `renderStyledLabelElement` multiline path emits `<tspan>` elements

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal word-wrapping helpers are private and validated via exported style-line and rendered text outcomes.

## Backfill - src/icons/registry.ts

**Tests written:** 5
**Coverage added:**
- [x] Default exports (`DEFAULT_ICON_POS`, `DEFAULT_ICON_SIZE`)
- [x] Supported icon positions set (`ICON_POSITIONS`) includes all four anchors
- [x] `getIcon` and `isKnownIcon` success path for known names
- [x] `getIcon` and `isKnownIcon` unknown-name path
- [x] `listIconNames` includes canonical and compatibility alias entries

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Lucide icon node internals are third-party data structures and are asserted by existence/lookup behavior only.

## Backfill - src/icons/render.ts

**Tests written:** 4
**Coverage added:**
- [x] `iconPosition` coordinate math for opposing anchor positions
- [x] `renderIcon` known-icon path returns SVG group markup with escaped attributes
- [x] `renderIcon` unknown-icon path returns empty string
- [x] `renderIconSpec` resolves bounds+spec into positioned icon output

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Private XML escaping and icon-node conversion helpers are covered indirectly through rendered SVG output assertions.

## Backfill - src/reporting-chain.ts

**Tests written:** 5
**Coverage added:**
- [x] `computeVerticalPath` returns upward target-to-root path including department ids
- [x] `computeReportingChain` for person targets returns manager chain of person ids
- [x] `computeReportingChain` resolves department targets to department head before traversal
- [x] `computeAltChain` follows kind-filtered dotted edge paths
- [x] `computeAltChain` stops traversal on visited-node cycle detection

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Internal index-building and recursive helper functions are private; behavior is asserted through exported chain outputs.

## Backfill - src/span-of-control.ts

**Tests written:** 4
**Coverage added:**
- [x] `defaultSpanOfControlOptions` documented default values
- [x] `spanOfControl` manual FTE override path (`source: manual`)
- [x] `spanOfControl` calculated path default policy (vacancies included, shadows excluded, departments excluded)
- [x] `spanOfControl` policy override path (vacancy excluded, shadow included)

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Private direct-child/manual-fte helper branches are covered through exported result invariants across employee, vacancy, department, and shadow cases.

## Backfill - src/style/packs.ts

**Tests written:** 5
**Coverage added:**
- [x] `stylePacks` registry contains baseline built-in packs
- [x] `getStylePack` case-insensitive lookup path
- [x] `getStylePack` unknown-name path returns `undefined`
- [x] `createStylePackLoader` custom override path shadows built-ins
- [x] `createStylePackLoader` fallback path delegates to built-ins and preserves unknown `undefined`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Full pack-content semantics are integration-level concerns; this backfill asserts lookup/selection contracts only.

## Backfill - src/cli.ts

**Tests written:** 5
**Coverage added:**
- [x] `runCli` help flag path prints usage to stdout and exits `0`
- [x] `runCli` missing-argument path prints usage to stderr and exits `1`
- [x] `runCli` file-read fs error path prints cannot-read message and exits `1`
- [x] `runCli` compile failure path prints resolve diagnostics and exits `1`
- [x] `runCli` successful compile path writes SVG output and exits `0`

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Direct-execution `main`/`process.exitCode` branches are process-boundary behavior and intentionally validated indirectly through `runCli` contracts.

## Backfill - src/index.ts

**Tests written:** 2
**Coverage added:**
- [x] Runtime re-export smoke test for id branding constructor exposure
- [x] Runtime re-export smoke test for style-pack lookup wiring

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Type-only barrel exports are compile-time contracts and not observable runtime behavior.

## Backfill - src/types/branded.ts

**Tests written:** 3
**Coverage added:**
- [x] `asNodeId` branding constructor runtime identity behavior
- [x] `asDeptId` branding constructor runtime identity behavior
- [x] `asHandle` branding constructor runtime identity behavior

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Compile-time brand distinctions are type-system-only and validated by TypeScript, not runtime behavior.

## Backfill - src/style/dsl.ts

**Tests written:** 6
**Coverage added:**
- [x] `extractDefinitionsBlock` empty-source path and invalid-declaration error path
- [x] `extractStyleSheet` simple style selector/declaration extraction path
- [x] `mergeStyleSheets` rule concatenation behavior
- [x] `applyDefinitionsToStyleSheet` defs overlay of variable bindings
- [x] `resolveStyleSheet` empty-style defaults path
- [x] `resolveStyleSheet` unknown-handle selector error path

**Implementation gaps** (paths that cannot be tested because the implementation does not handle them):
- None identified in this slice.

**Uncovered by design** (paths excluded with justification):
- Full selector/declaration matrix and variable-icon derivation permutations are extensive integration scenarios; this slice backfills core exported contracts and representative error handling.