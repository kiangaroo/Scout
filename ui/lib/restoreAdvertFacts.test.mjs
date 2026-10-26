import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspacePaths } from './workspace.mjs';
import { loadCachedAdvertObservations } from './restoreAdvertFacts.mjs';
import { restoreAdvertFacts } from './restoreAdvertFacts.mjs';

const tracker = {
  updated: '2026-10-01',
  opportunities: [{
    id: 'acme-analyst-2026-10', vacancyId: 'vacancy-1', company: 'Acme', role: 'Data Analyst',
    status: 'applied', score: 84, notes: 'keep this', contacts: [{ name: 'Pat' }],
    commute: { destination: 'London', publicTransportMinutes: 38 }, log: [{ event: 'replied' }],
    knownFacts: { hours: 'part-time' },
    sourceReferences: [{ source: 'provider-a', providerId: 'req-123' }],
  }],
};

test('restores cached advert facts only for an exact vacancy identity and preserves tracker decisions', () => {
  const result = restoreAdvertFacts(tracker, [{
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst',
    canonicalUrl: 'https://jobs.example.test/acme/1', fetchedAt: '2026-09-28T09:00:00.000Z',
    compensation: { minimum: 50000, maximum: 60000, currency: 'GBP', period: 'year' },
    description: 'Full-time role with three days per week in the office.',
  }], '2026-10-02');
  assert.equal(result.updated, 1);
  assert.equal(result.matched, 1);
  const entry = result.tracker.opportunities[0];
  assert.equal(entry.status, 'applied');
  assert.equal(entry.score, 84);
  assert.equal(entry.notes, 'keep this');
  assert.deepEqual(entry.contacts, tracker.opportunities[0].contacts);
  assert.deepEqual(entry.commute, tracker.opportunities[0].commute);
  assert.deepEqual(entry.log, tracker.opportunities[0].log);
  assert.deepEqual(entry.knownFacts, tracker.opportunities[0].knownFacts);
  assert.equal(entry.advertFacts.availability, 'unverified');
  assert.equal(entry.advertFacts.hours, 'full-time');
  assert.equal(entry.advertFacts.officeDays, 3);
});

test('refuses a vacancy-id collision when employer or title differs and creates no tracker entries', () => {
  const result = restoreAdvertFacts(tracker, [{
    vacancyId: 'vacancy-1', employer: 'Other Co', title: 'Data Analyst',
    canonicalUrl: 'https://jobs.example.test/other', fetchedAt: '2026-09-28', description: 'Full-time',
  }]);
  assert.equal(result.updated, 0);
  assert.equal(result.matched, 0);
  assert.equal(result.tracker, tracker);
  assert.equal(result.tracker.opportunities.length, 1);
});

test('matches on an exact provider vacancy reference when canonical vacancy ids differ', () => {
  const result = restoreAdvertFacts(tracker, [{
    vacancyId: 'provider-internal-id', employer: 'Acme', title: 'Data Analyst',
    sourceReferences: [{ source: 'provider-a', providerId: 'req-123' }],
    fetchedAt: '2026-09-28', workingPattern: 'hybrid',
  }]);
  assert.equal(result.updated, 1);
  assert.equal(result.tracker.opportunities[0].advertFacts.workingPattern, 'hybrid');
});

test('does not erase known facts when cached observations contain no usable value', () => {
  const withFacts = structuredClone(tracker);
  withFacts.opportunities[0].advertFacts = {
    compensation: { minimum: 45000, maximum: null, currency: 'GBP', period: 'year', rateType: 'salary', certainty: 'exact' },
    workingPattern: 'remote', employmentType: null, hours: 'part-time', officeDays: null,
    sourceUrl: null, checkedAt: '2026-09-01', availability: 'unverified',
  };
  const result = restoreAdvertFacts(withFacts, [{
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst', fetchedAt: '2026-10-03',
  }]);
  assert.equal(result.updated, 0);
  assert.equal(result.tracker.opportunities[0].advertFacts.compensation.minimum, 45000);
  assert.equal(result.tracker.opportunities[0].advertFacts.workingPattern, 'remote');
  assert.equal(result.tracker.opportunities[0].advertFacts.hours, 'part-time');
});




test('cached observation loader scans ordinary run folders and counts corrupt journals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-cached-facts-'));
  try {
    const runs = workspacePaths(root).runs;
    fs.mkdirSync(path.join(runs, 'valid-run'), { recursive: true });
    fs.writeFileSync(path.join(runs, 'valid-run', 'journal.jsonl'), '');
    fs.mkdirSync(path.join(runs, 'bad-run'), { recursive: true });
    fs.writeFileSync(path.join(runs, 'bad-run', 'journal.jsonl'), '{broken\n');
    const result = loadCachedAdvertObservations(root);
    assert.deepEqual(result, { observations: [], skippedRuns: 1, scannedRuns: 2 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('newest cached facts win across shuffled observations while existing tracker facts stay authoritative', () => {
  const withKnownFacts = structuredClone(tracker);
  withKnownFacts.opportunities[0].advertFacts = {
    compensation: { minimum: 70000, maximum: null, currency: 'GBP', period: 'year', rateType: 'salary', certainty: 'exact' },
    workingPattern: 'hybrid', employmentType: null, hours: null, officeDays: null,
    sourceUrl: null, checkedAt: '2026-09-01', availability: null,
  };
  const oldObservation = {
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst', fetchedAt: '2026-08-01',
    compensation: { minimum: 40000, currency: 'GBP', period: 'year' }, workingPattern: 'remote',
    description: 'Full-time role with two days per week in the office.',
  };
  const newestObservation = {
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst', fetchedAt: '2026-09-15',
    compensation: { minimum: 55000, currency: 'GBP', period: 'year' }, workingPattern: 'onsite',
    semanticEvidence: { responsibilityFacts: [{ fact: 'Three days per week in the office.' }] },
  };
  const result = restoreAdvertFacts(withKnownFacts, [oldObservation, newestObservation]);
  const facts = result.tracker.opportunities[0].advertFacts;
  assert.equal(facts.compensation.minimum, 70000);
  assert.equal(facts.workingPattern, 'hybrid');
  assert.equal(facts.hours, 'full-time');
  assert.equal(facts.officeDays, 3);
  assert.equal(facts.checkedAt, '2026-09-01');
});

test('newest cached observation supplies missing facts regardless of input order', () => {
  const older = {
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst', fetchedAt: '2026-08-01',
    compensation: { minimum: 40000, currency: 'GBP', period: 'year' }, workingPattern: 'remote',
  };
  const newer = {
    vacancyId: 'vacancy-1', employer: 'Acme', title: 'Data Analyst', fetchedAt: '2026-09-15',
    compensation: { minimum: 55000, currency: 'GBP', period: 'year' }, workingPattern: 'onsite',
  };
  const result = restoreAdvertFacts(tracker, [older, newer]);
  assert.equal(result.tracker.opportunities[0].advertFacts.compensation.minimum, 55000);
  assert.equal(result.tracker.opportunities[0].advertFacts.workingPattern, 'onsite');
  const shuffled = restoreAdvertFacts(tracker, [newer, older]);
  assert.equal(shuffled.tracker.opportunities[0].advertFacts.compensation.minimum, 55000);
  assert.equal(shuffled.tracker.opportunities[0].advertFacts.workingPattern, 'onsite');
});
