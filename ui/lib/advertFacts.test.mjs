import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advertFacts, mergeAdvertFacts } from './advertFacts.mjs';

test('advert facts retain bounded structured fields and conservative explicit schedule facts', () => {
  const result = advertFacts({
    url: 'https://example.test/jobs/123?utm_source=private#details',
    fetchedAt: '2026-10-24T09:30:00.000Z',
    compensation: { value: {
      minimum: 70000, maximum: 80000, currency: 'GBP', period: 'year',
      rateType: 'salary', certainty: 'range',
    } },
    workingPattern: { value: 'hybrid' },
    employmentType: { value: 'permanent' },
    description: 'Hybrid arrangement. Three days each week are in the office. This is a full-time role.',
  });

  assert.deepEqual(result, {
    compensation: {
      minimum: 70000, maximum: 80000, currency: 'GBP', period: 'year',
      rateType: 'salary', certainty: 'range',
    },
    workingPattern: 'hybrid', employmentType: 'permanent', hours: 'full-time',
    officeDays: 3, sourceUrl: 'https://example.test/jobs/123',
    checkedAt: '2026-10-24', availability: 'unverified',
  });
  assert.doesNotMatch(JSON.stringify(result), /private|arrangement|full-time role/);
});

test('advert facts keep unknowns unknown and reject ambiguous or inferred office schedules', () => {
  const result = advertFacts({
    url: 'https://example.test/role',
    description: 'Two days per week working from home, three days in the office. Full-time and part-time options are available.',
  });
  assert.equal(result, null);
});

test('office days require one explicit weekly office count and reject client visits, ranges, and negation', () => {
  const office = (description) => advertFacts({ url: 'https://example.test/role', description })?.officeDays ?? null;
  assert.equal(office('Three days per week in the office.'), 3);
  assert.equal(office('In the office two days each week.'), 2);
  assert.equal(office('Two days per week on-site with clients.'), null);
  assert.equal(office('On-site client visits happen three days per week.'), null);
  assert.equal(office('Between two and three days per week in the office.'), null);
  assert.equal(office('Two or three days per week in the office.'), null);
  assert.equal(office('2-3 days per week in the office.'), null);
  assert.equal(office('Not three days per week in the office.'), null);
  assert.equal(office('Two days per week in the office; three days per week in the office.'), null);
});

test('metadata alone does not create an advert facts payload', () => {
  assert.equal(advertFacts({
    url: 'https://example.test/role', fetchedAt: '2026-10-24T09:00:00Z',
  }), null);
});

test('advert facts reject credential shaped values and preserve known prior facts on unknown scans', () => {
  const previous = advertFacts({
    url: 'https://example.test/role', fetchedAt: '2026-10-23T12:00:00Z',
    compensation: { value: { minimum: 50000, currency: 'GBP', period: 'year', rateType: 'salary', certainty: 'exact' } },
    workingPattern: { value: 'hybrid' }, description: 'Two days each week in office.',
  });
  const next = advertFacts({ url: 'https://example.test/role?token=secret', description: 'Flexible working.' });
  const merged = mergeAdvertFacts(previous, next);
  assert.deepEqual(merged.compensation, previous.compensation);
  assert.equal(merged.workingPattern, 'hybrid');
  assert.equal(merged.officeDays, 2);
  assert.equal(merged.sourceUrl, 'https://example.test/role');
  assert.equal(merged.checkedAt, previous.checkedAt);
  assert.doesNotMatch(JSON.stringify(merged), /secret|token=/i);
});
