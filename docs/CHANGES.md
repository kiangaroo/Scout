# Unreleased changes

## Fixed

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
