# lead-verification skill

Project-specific rules that keep this application's lead data trustworthy.
`SKILL.md` is the instruction set; it is loaded when working on discovery,
identity, deduplication, website verification, qualification or evidence.

The rules it describes are also enforced in code:

- `src/lib/identity/identity.ts` — identity signals and confidence thresholds
- `src/lib/identity/dedupe.ts` — merge / branch / review decisions
- `src/lib/website/candidates.ts` — channels and their honest availability
- `src/lib/website/score.ts` — candidate scoring weights
- `src/lib/website/verify.ts` — status resolution and evidence
- `src/lib/qualification/qualify.ts` — what may become a lead
- `tests/website-verification.test.ts` — the behaviour these rules promise
