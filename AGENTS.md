# AGENTS.md

# Prompting GPT 5.2 Codex for Continuity

It excels at long running tasks but without explicit guidance can lose track of outcomes

Put this at the top of your AGENTS .md file, it will let Codex work on even larger scale tasks

It's how I let it run for 3 hours coherently

## Continuity Ledger (compaction-safe)
Maintain a single Continuity Ledger for this workspace in `http://CONTINUITY.md`. The ledger is the canonical session briefing designed to survive context compaction; do not rely on earlier chat text unless it's reflected in the ledger.

### How it works
- At the start of every assistant turn: read `http://CONTINUITY.md`, update it to reflect the latest goal/constraints/decisions/state, then proceed with the work.
- Update `http://CONTINUITY.md` again whenever any of these change: goal, constraints/assumptions, key decisions, progress state (Done/Now/Next), or important tool outcomes.
- Keep it short and stable: facts only, no transcripts. Prefer bullets. Mark uncertainty as `UNCONFIRMED` (never guess).
- If you notice missing recall or a compaction/summary event: refresh/rebuild the ledger from visible context, mark gaps `UNCONFIRMED`, ask up to 1-3 targeted questions, then continue.

### `functions.update_plan` vs the Ledger
- `functions.update_plan` is for short-term execution scaffolding while you work (a small 3-7 step plan with pending/in_progress/completed).
- `http://CONTINUITY.md` is for long-running continuity across compaction (the "what/why/current state"), not a step-by-step task list.
- Keep them consistent: when the plan or state changes, update the ledger at the intent/progress level (not every micro-step).

### In replies
- Begin with a brief "Ledger Snapshot" (Goal + Now/Next + Open Questions). Print the full ledger only when it materially changes or when the user asks.

### `http://CONTINUITY.md` format (keep headings)
- Goal (incl. success criteria):
- Constraints/Assumptions:
- Key decisions:
- State:
- Done:
- Now:
- Next:
- Open questions (UNCONFIRMED if needed):
- Working set (files/ids/commands):

## Project context
- This repository contains Loopt research notes and a prototype web app in `web/`.
- Netlify Functions live in `netlify/functions/`.

## Writing and sourcing guidelines
- Keep additions factual and include sources with links and access dates for key claims.
- Use clear headings and short paragraphs; avoid rewriting existing sections unless asked.
- Default to ASCII; introduce Unicode only when required by proper names or quoted material.

## Dev environment tips
- Web app lives in `web/`. Use `cd web` then `npm install` and `npm run dev`.
- Use `rg` to search across notes when locating prior coverage.

## Testing instructions
- No automated tests are defined for this project yet.

## PR / change hygiene
- Keep changes scoped to the requested task.
- Do not delete or rename existing notes without explicit instruction.
