import test from 'node:test';
import assert from 'node:assert/strict';
import { addSpeculativeProspect } from './speculativeProspects.mjs';

const TRACKER = {
  updated: '2026-10-20',
  opportunities: [{ id: 'existing-job', company: 'Existing Co', status: 'shortlist', tags: ['Keep me'] }],
  extra: { preserved: true },
};

test('adds a dated, unscored employer prospect without changing existing tracker data', () => {
  const result = addSpeculativeProspect(TRACKER, {
    company: 'Example Systems',
    careersUrl: 'https://example.com/careers',
    interest: 'Their public product work aligns with my interests.',
    roleFocus: 'Embedded systems',
    location: 'Cambridge',
  }, '2026-10-24');

  assert.notEqual(result, TRACKER);
  assert.deepEqual(result.opportunities[0], TRACKER.opportunities[0]);
  assert.deepEqual(result.extra, TRACKER.extra);
  assert.equal(result.opportunities.length, 2);
  assert.deepEqual(result.opportunities[1], {
    id: 'example-systems-speculative-2026-10',
    company: 'Example Systems',
    role: 'Speculative enquiry — Embedded systems',
    location: 'Cambridge',
    score: null,
    type: 'employer-prospect',
    opportunityKind: 'employer-prospect',
    status: 'new',
    tags: ['Speculative Outreach'],
    createdAt: '2026-10-24',
    lastChecked: null,
    sources: ['https://example.com/careers'],
    notes: 'Their public product work aligns with my interests.',
  });
});

test('uses a generic enquiry role when no role focus is supplied', () => {
  const result = addSpeculativeProspect(TRACKER, {
    company: 'Another Employer',
    careersUrl: 'https://another.example/careers',
    interest: 'Relevant public mission.',
  }, '2026-10-24');
  assert.equal(result.opportunities[1].role, 'Speculative enquiry');
});

test('rejects a duplicate employer prospect by normalized company name', () => {
  const existing = addSpeculativeProspect(TRACKER, {
    company: 'Example Systems',
    careersUrl: 'https://example.com/careers',
    interest: 'Reason.',
  }, '2026-10-24');
  assert.throws(() => addSpeculativeProspect(existing, {
    company: ' example  systems ',
    careersUrl: 'https://example.com/jobs',
    interest: 'A different reason.',
  }, '2026-10-24'), /duplicate employer prospect/i);
});

test('rejects unsafe URLs, invalid companies, and missing or oversized rationale', () => {
  const valid = { company: 'Example Systems', careersUrl: 'https://example.com/careers', interest: 'Reason.' };
  for (const careersUrl of [
    'http://example.com/careers', 'https://user:pass@example.com/careers',
    'https://example.com/careers?token=x', 'https://example.com/careers#jobs',
    'https://127.0.0.1/careers', 'https://[::1]/careers', 'https://localhost/careers',
  ]) {
    assert.throws(() => addSpeculativeProspect(TRACKER, { ...valid, careersUrl }, '2026-10-24'));
  }
  assert.throws(() => addSpeculativeProspect(TRACKER, { ...valid, company: '  ' }, '2026-10-24'));
  assert.throws(() => addSpeculativeProspect(TRACKER, { ...valid, interest: '  ' }, '2026-10-24'));
  assert.throws(() => addSpeculativeProspect(TRACKER, { ...valid, interest: 'x'.repeat(1001) }, '2026-10-24'));
});

test('stores plain rationale literally and does not fabricate verification dates or source facts', () => {
  const interest = '<script>alert("x")</script> & public research only';
  const result = addSpeculativeProspect(TRACKER, {
    company: 'Literal Example', careersUrl: 'https://literal.example/careers', interest,
  }, '2026-10-24');
  const entry = result.opportunities[1];
  assert.equal(entry.notes, interest);
  assert.equal(entry.createdAt, '2026-10-24');
  assert.equal(entry.lastChecked, null);
  assert.equal(entry.score, null);
});
