import fs from 'node:fs';
import path from 'node:path';
import { advertFacts, mergeAdvertFacts } from './advertFacts.mjs';
import { openRunJournal } from './runJournal.mjs';
import { readRunArtifact } from './runArtifacts.mjs';
import { workspacePaths } from './workspace.mjs';

const MAX_RUNS = 20;
const MAX_OBSERVATIONS = 10_000;

function text(value) {
  return String(value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value ?? '').trim();
}

function identityFields(entry) {
  return {
    employer: text(entry?.employer ?? entry?.company),
    title: text(entry?.title ?? entry?.role),
  };
}

function sameEmployerTitle(left, right) {
  const a = identityFields(left);
  const b = identityFields(right);
  return Boolean(a.employer && b.employer && a.title && b.title
    && a.employer.toLocaleLowerCase() === b.employer.toLocaleLowerCase()
    && a.title.toLocaleLowerCase() === b.title.toLocaleLowerCase());
}

function references(value) {
  return Array.isArray(value?.sourceReferences) ? value.sourceReferences : [];
}

function sameProviderReference(entry, observation) {
  return references(entry).some((left) => references(observation).some((right) => (
    text(left?.source) && text(left?.providerId)
    && text(left.source) === text(right?.source)
    && text(left.providerId) === text(right?.providerId)
  )));
}

function matches(entry, observation) {
  if (!entry || !observation || typeof entry !== 'object' || typeof observation !== 'object') return false;
  if (entry.vacancyId && observation.vacancyId && entry.vacancyId === observation.vacancyId
    && sameEmployerTitle(entry, observation)) return true;
  return sameProviderReference(entry, observation) && sameEmployerTitle(entry, observation);
}

function observationDescription(observation) {
  const direct = text(observation?.description);
  if (direct) return direct.slice(0, 12_000);
  const facts = Array.isArray(observation?.responsibilityFacts)
    ? observation.responsibilityFacts
    : Array.isArray(observation?.semanticEvidence?.responsibilityFacts)
      ? observation.semanticEvidence.responsibilityFacts : [];
  return facts.map((fact) => text(fact?.fact ?? fact?.text ?? fact)).filter(Boolean).join('. ').slice(0, 12_000);
}

function observationDate(observation, fallback) {
  for (const value of [
    observation?.fetchedAt, observation?.lastSeenAt, observation?.lastSeen,
    observation?.firstSeenAt, observation?.firstSeen, observation?.capturedAt, fallback,
  ]) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
    if (!match) continue;
    const date = new Date(`${match[1]}T00:00:00.000Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]) return value;
  }
  return null;
}

function factsFor(observation, checkedAt) {
  const url = observation?.canonicalUrl ?? observation?.sourceUrl ?? observation?.url;
  return advertFacts({
    url,
    fetchedAt: observationDate(observation, checkedAt),
    compensation: observation?.compensation,
    workingPattern: observation?.workingPattern,
    employmentType: observation?.employmentType,
    description: observationDescription(observation),
  });
}

/**
 * Restore only deterministic advert facts from retained scan observations.
 * Tracker decisions and user-maintained fields are copied without alteration.
 */
export function restoreAdvertFacts(tracker, observations, checkedAt) {
  if (!tracker || !Array.isArray(tracker.opportunities) || !Array.isArray(observations)) {
    throw new TypeError('tracker opportunities and observations are required');
  }
  let next = tracker;
  const matchedIndexes = new Set();
  const updatedIndexes = new Set();
  const date = checkedAt ?? null;
  const newestFirst = [...observations].sort((left, right) => (
    (observationTimestamp(right) ?? 0) - (observationTimestamp(left) ?? 0)
  ));
  for (const observation of newestFirst) {
    const index = tracker.opportunities.findIndex((entry) => matches(entry, observation));
    if (index < 0) continue;
    matchedIndexes.add(index);
    const previous = next.opportunities[index];
    const restored = factsFor(observation, date);
    const combined = mergeAdvertFacts(restored, previous.advertFacts);
    if (JSON.stringify(combined) === JSON.stringify(previous.advertFacts ?? null)) continue;
    if (next === tracker) next = { ...tracker, opportunities: [...tracker.opportunities] };
    next.opportunities[index] = { ...previous, advertFacts: combined };
    updatedIndexes.add(index);
  }
  return { tracker: next, updated: updatedIndexes.size, matched: matchedIndexes.size };
}

function observationTimestamp(observation) {
  const value = observation?.fetchedAt ?? observation?.lastSeenAt ?? observation?.lastSeen
    ?? observation?.firstSeenAt ?? observation?.firstSeen ?? observation?.capturedAt;
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function runTimestamp(directory) {
  const journal = path.join(directory, 'journal.jsonl');
  try {
    const stats = fs.lstatSync(journal);
    return stats.isFile() && !stats.isSymbolicLink() ? stats.mtimeMs : 0;
  } catch {
    try {
      const stats = fs.lstatSync(path.join(directory, 'meta.json'));
      return stats.isFile() && !stats.isSymbolicLink() ? stats.mtimeMs : 0;
    } catch { return 0; }
  }
}

function ordinaryRunDirectories(runsDirectory) {
  try {
    if (!fs.lstatSync(runsDirectory).isDirectory() || fs.lstatSync(runsDirectory).isSymbolicLink()) return [];
  } catch { return []; }
  return fs.readdirSync(runsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => ({ runId: entry.name, directory: path.join(runsDirectory, entry.name) }))
    .sort((left, right) => runTimestamp(right.directory) - runTimestamp(left.directory))
    .slice(0, MAX_RUNS);
}

/**
 * Read bounded retained scan artifacts without invoking a source or model.
 * Corrupt or unreadable runs are skipped and counted; no candidate data is truncated.
 */
export function loadCachedAdvertObservations(root) {
  const observations = [];
  let skippedRuns = 0;
  const runs = ordinaryRunDirectories(workspacePaths(root).runs);
  for (const { runId, directory } of runs) {
    let local = [];
    try {
      const journalFile = path.join(directory, 'journal.jsonl');
      const journalStats = fs.lstatSync(journalFile);
      if (!journalStats.isFile() || journalStats.isSymbolicLink()) throw new Error('run journal is not an ordinary file');
      const run = openRunJournal(root, runId);
      const selected = run.events.findLast((event) => event.type === 'stage.completed' && event.stageId === 'select');
      if (selected?.payload?.artifact) {
        const data = readRunArtifact({ ...selected.payload.artifact, directory: run.directory })?.data;
        const candidates = Array.isArray(data?.ranked) ? data.ranked : Array.isArray(data?.candidates) ? data.candidates : [];
        for (const candidate of candidates) {
          local.push({
            ...candidate,
            capturedAt: candidate?.fetchedAt ?? candidate?.lastSeenAt ?? candidate?.lastSeen
              ?? candidate?.firstSeenAt ?? candidate?.firstSeen ?? selected.timestamp ?? selected.recordedAt,
          });
        }
      }
    } catch {
      skippedRuns += 1;
      continue;
    }
    if (observations.length + local.length > MAX_OBSERVATIONS) {
      throw new RangeError('cached advert observation limit exceeded');
    }
    observations.push(...local);
  }
  if (observations.length) {
    observations.sort((left, right) => (observationTimestamp(right) ?? 0) - (observationTimestamp(left) ?? 0));
  }
  return { observations, skippedRuns, scannedRuns: runs.length };
}


