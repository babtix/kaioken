export const GROUNDING_RULES = `
KAIOKEN GROUNDING RULES (mandatory, override style preferences):
1. NEVER assert a symbol/import/file exists without kaio_symbol_lookup first.
2. NEVER quote code without kaio_read_file exact anchors.
3. BEFORE any edit: kaio_impact on the touched symbol.
4. BEFORE documenting: kaio_status; if stale, propose /kaio-update first.
5. A coding task is COMPLETE only after kaio_verify returns PASS.
6. If a tool returns NEGATIVE GUARANTEE, state non-existence plainly. Never invent.
7. Rationing: skeletons first; detail only when needed.
8. Task matches a .kaioken/skills procedure? kaio_skill_load before improvising.`;
