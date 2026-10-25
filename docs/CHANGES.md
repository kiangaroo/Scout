# Unreleased changes

## Fixed

- Research waits briefly for startup or backup workspace updates before starting one AI turn. Persistent contention is reported as workspace busy. Research receives bounded selected-job and career evidence instead of rereading the full tracker; output limits remain unchanged.

- Add **research my application approach** to job details: a user-started research turn in the existing job chat, with a saved per-opportunity plan, evidence and effort guidance, and separate drafting choices. Research uses read-only provider controls; failed or empty results preserve the previous plan.

- Job source previews try up to three saved alternatives after a fetch failure, label fallback use, and allow retrying a failed preview. Job details provide a user-triggered employer/title web search without treating results as verified vacancies.

- Retain structured advert pay, working pattern, contract, hours and explicit weekly office-day facts, with estimates and unknowns labelled in job details.
- Restore missing facts for existing jobs from retained scan evidence without changing decisions or making another source/model request. Cached evidence is not a fresh availability check.
- Add researched, unscored employer prospects through Speculative. Saving one does not send an enquiry or silently enable employer crawling. Prospects are excluded from vacancy liveness checks.

- Profile-publication transactions no longer appear as running scans. Paused
  scans and historical queue claims no longer imply that a worker is active.

- Manual scans briefly wait for non-scan workspace operations and report a
  persistent busy workspace without leaving an unprocessed scan request.

- The Scan button honours the saved model for the selected provider. A queued
  request is acknowledged as queued rather than reported as a failed scan.

- Detailed assessment uses explicit Action/Check band markers instead of
  reusing sparse discovery relevance as a final fit score. Discovery scores
  remain available separately; mandatory failures and discard recommendations
  still prevent a role being kept, and unknown requirements cannot reach Action.

- After a restart, paused runs and stale queue claims allow an explicit recovery
  request instead of permanently disabling Scan now. Public transport preference
  wording now selects the matching commute filter.

- Scan results warn when individual advert availability could not be verified,
  even when an aggregator returned candidates successfully.

- Scans recover a failed finalisation when its journal-authorised mutation is
  still pending, and safely reclaim an orphaned read-only `ls-files` guard.

- Adzuna predicted salaries retain estimated certainty and display an estimate
  label. Missing or invalid prediction flags leave salary certainty unknown.

- Publishing a reviewed search profile no longer invalidates an otherwise
  approved setup. The readiness check verifies the published profile and the
  reviewed configuration baseline, including for retuned workspaces. Changes to
  approved career evidence or unrelated configuration still require review.
