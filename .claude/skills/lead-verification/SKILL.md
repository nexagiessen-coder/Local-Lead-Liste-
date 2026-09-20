---
name: lead-verification
description: Rules for researching, identifying and verifying local businesses in this repository — especially for deciding whether a business has a website. Use when working on discovery, identity matching, deduplication, website verification, qualification, evidence, or any change that could affect whether a business is shown as "verified no website".
---

# Lead verification

This project sells websites to businesses that do not have one. A false
"no website" lead wastes a call, embarrasses the caller and costs trust. A
missed lead costs nothing but an opportunity.

**Therefore: high precision, not high volume.** When in doubt, say so.

## The rule everything follows

> Absence of evidence is only evidence of absence when every channel actually
> ran.

A business may only be recorded as `VERIFIED_NO_WEBSITE` when **all** of the
following hold:

1. `identityStatus === 'CONFIRMED'` — we know exactly which business this is.
2. Every research channel reports `ok`. A channel reporting `unavailable` or
   `error` blocks the conclusion. (`skipped` is allowed: it means the channel
   deliberately did not apply.)
3. At least `MIN_CHANNELS_FOR_NO_WEBSITE` channels completed (floor: 2).
4. The business profile's website field is empty or points at something that is
   not an own website.
5. No candidate domain reached the probable threshold.
6. The resulting confidence is ≥ 70.

If any one of these fails, the status is `REQUIRES_MANUAL_CHECK` or
`WEBSITE_UNCERTAIN` — never "no website".

## Never do these

- Never conclude "no website" because a search returned nothing *if the search
  could not run*. An unconfigured or failing provider must throw, not return an
  empty list. `NoWebSearchProvider` exists precisely to make this impossible to
  get wrong.
- Never treat a temporarily unreachable site as a non-existent site. A 5xx, a
  timeout or a DNS failure on a *declared or searched* URL is an open question.
  (A guessed domain that does not resolve is different: nothing is hosted there.)
- Never accept a domain because the name looks similar. Acceptance requires a
  strong signal: a matching phone number, a matching street + postal code, or
  the business profile itself declaring the domain.
- Never merge two businesses on name similarity alone. Same name + different
  address or phone = separate locations (branches), kept separate.
- Never let a social media profile stand in for a website — and never let its
  existence alone prove there is no website either. Record it as context.
- Never invent opening hours, addresses, phone numbers or descriptions. Unknown
  is `null`, and the UI renders it as "unknown".
- Never let a natural-language command, an override flag or a performance
  optimisation skip a verification step.
- Never expose model reasoning as evidence. Evidence is checkable facts with
  sources.

## Identity before website

Identity confidence is scored from independent signals (see
`src/lib/identity/identity.ts`):

| Signal | Points | Strength |
| --- | --- | --- |
| Valid E.164 phone | 35 | strong |
| Complete street address | 30 | strong |
| Partial address | 15 | medium |
| Coordinates | 10 | medium |
| Distinctive name tokens | 8 | weak |
| Category | 4 | weak |
| Two or more independent sources | 15 | strong |

`CONFIRMED` ≥ 70 · `PROBABLE` ≥ 45 · otherwise `UNVERIFIED`.
Conflicting data between sources forces `NEEDS_REVIEW` and never auto-resolves.

## Deduplication rules, in order

1. Same E.164 phone **and** name similarity ≥ 0.4 → same business.
2. Same phone, unrelated names → `review` (could be a shared reception desk).
3. Same normalised address **and** name similarity ≥ 0.6 → same business.
4. Same address, different name *and* different phone → different business.
5. Within 60 m **and** name similarity ≥ 0.85 → same business (unless phones
   conflict, which makes it `review`).
6. Same name elsewhere → `branch`: a separate business, cross-linked.

## Candidate scoring

Weights live in `src/lib/website/score.ts`. Positive signals accumulate;
contradicting ones subtract hard (a different phone number on the page is −40, a
different postal code −25). Accept at ≥ 70 *with* a strong signal; probable at
≥ 45; otherwise reject with a stated reason. Parked pages and empty pages are
rejected outright; "coming soon" pages cap at probable.

## Evidence

Every verification writes an evidence trail: what identity we established, which
channels ran and with what result, which domains were checked, what each one
matched or contradicted, and the conclusion. Each item has a stance
(`supports` / `contradicts` / `neutral`) and, where one exists, a source URL.

A user must be able to read the evidence and reach the same conclusion by hand.

## Efficiency, but never at the cost of accuracy

Cache and reuse: geocoding results are cached, verifications are reused until
`VERIFICATION_TTL_DAYS` has passed, candidate domains are deduplicated before
fetching, and each business is capped at 10 page fetches per run. Cheap
deterministic checks (normalisation, phone parsing, domain classification) run
before any network call.

None of this may remove a verification step. If saving a request would change a
conclusion, make the request.

## When changing this code

- Add a test to `tests/website-verification.test.ts` for every new status path.
- Keep discovery, identity, deduplication, verification and qualification in
  separate modules; do not let a provider reach into the engine.
- A provider that cannot answer must throw `ProviderError`, not return `[]`.
- Update `docs/ARCHITECTURE.md` when the pipeline or thresholds change.
