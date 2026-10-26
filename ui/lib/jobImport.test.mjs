import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importJobFromUrl, isDuplicateImportedJob } from './jobImport.mjs';

const jobHtml = (company = 'Example Ltd', title = 'Engineer') => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title, description: 'Build reliable software systems. Must have experience with cloud services.', hiringOrganization: { '@type': 'Organization', name: company }, url: 'https://jobs.example.test/role/1', jobLocation: { address: { addressLocality: 'London' } } })}</script><main><p>Build reliable software systems. Must have experience with cloud services.</p></main>`;
const assessment = (candidate, recommendation = 'keep') => ({
  candidateId: candidate.candidateId,
  summary: 'Synthetic assessment',
  responsibilityFit: { rating: 'strong', advertEvidence: 'Build reliable software systems.', profileEvidence: 'Relevant experience is recorded.', explanation: 'Evidence aligns.' },
  mandatoryRequirements: candidate.mandatorySignals.map((signal) => ({ requirement: signal.text, advertEvidence: signal.text, advertEvidenceId: signal.id, status: 'unknown', profileEvidence: null })),
  transferableExperience: [], uncertainties: ['Synthetic uncertainty'], strengths: [], concerns: [], recommendation,
});
const options = (overrides = {}) => ({
  url: 'https://jobs.example.test/role/1?utm_source=private&session=secret&job=role-1',
  fetchResource: async () => ({ ok: true, status: 200, text: async () => jobHtml() }),
  assess: async ({ candidate }) => assessment(candidate),
  context: { candidates: [] },
  policy: { actionScore: 70, checkScore: 55 },
  now: () => '2026-10-25T12:00:00.000Z',
  ...overrides,
});

test('imports one fetched JSON-LD vacancy with ordinary assessment and sanitized URL', async () => {
  const result = await importJobFromUrl(options());
  assert.equal(result.status, 'imported');
  assert.equal(result.entry.company, 'Example Ltd');
  assert.equal(result.entry.role, 'Engineer');
  assert.equal(result.entry.sources[0], 'https://jobs.example.test/role/1');
  assert.ok(result.entry.urlIdentityDigest);
  assert.equal(result.entry.scoreBasis, 'assessment-band');
  assert.ok(result.assessment);
  assert.match(result.entry.notes, /Assessment: Synthetic assessment/);
  assert.match(result.entry.notes, /Uncertainty: Synthetic uncertainty/);
  assert.doesNotMatch(JSON.stringify(result.entry), /session=secret|job=role-1/);
});

test('duplicate URL import is reported before assessment and preserves input history', async () => {
  const previous = { id: 'old', company: 'Example Ltd', role: 'Engineer', status: 'discarded', score: 12, sources: ['https://jobs.example.test/role/1?utm_source=private&session=secret&job=role-1'] };
  let assessments = 0;
  const result = await importJobFromUrl(options({ existingEntries: [previous], assess: async () => { assessments += 1; } }));
  assert.equal(result.status, 'duplicate');
  assert.equal(assessments, 0);
  assert.equal(previous.status, 'discarded');
  assert.equal(isDuplicateImportedJob({ sources: ['https://jobs.example.test/role/1'] }, [previous]), false);
});

test('query-addressed job URLs do not collapse on the shared query-free path', () => {
  assert.equal(isDuplicateImportedJob(
    { company: 'Example Ltd', role: 'Engineer', url: 'https://jobs.example.test/role/1?id=1' },
    [{ company: 'Example Ltd', role: 'Engineer', sources: ['https://jobs.example.test/role/1?id=2'] }],
  ), false);
  assert.equal(isDuplicateImportedJob(
    { url: 'https://jobs.example.test/role/1?utm_source=one' },
    [{ sources: ['https://jobs.example.test/role/1?utm_source=two'] }],
  ), true);
});

test('retains discard assessment with warning and supports user advert fallback', async () => {
  const pastedAdvert = 'Example Ltd is hiring an Engineer. Build reliable software systems. Must have experience with cloud services.';
  const result = await importJobFromUrl(options({
    fetchResource: async () => { throw Object.assign(new Error('blocked'), { reasonCode: 'private-address' }); },
    pastedAdvert,
    extract: async ({ text }) => ({ company: 'Example Ltd', title: 'Engineer', description: text }),
    assess: async ({ candidate }) => assessment(candidate, 'discard'),
  }));
  assert.equal(result.status, 'imported');
  assert.equal(result.entry.eligibility.status, 'ineligible');
  assert.ok(result.warnings.length);
  assert.match(result.entry.notes, /user-pasted advert/i);
});

test('rejects multi-vacancy pages and oversize pasted advert without assessment', async () => {
  let calls = 0;
  const html = jobHtml() + jobHtml('Other Ltd', 'Designer');
  const result = await importJobFromUrl(options({
    fetchResource: async () => ({ ok: true, status: 200, text: async () => html }),
    assess: async () => { calls += 1; },
  }));
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 0);
  await assert.rejects(() => importJobFromUrl(options({ pastedAdvert: 'x'.repeat(100_001) })), /100000 UTF-8 bytes/);
});

test('extracts one generic HTML vacancy from URL-only input and keeps source facts', async () => {
  let prompt = '';
  const result = await importJobFromUrl(options({
    fetchResource: async () => ({ ok: true, status: 200, text: async () => '<title>Engineer at Example Ltd</title><main><p>Build reliable software systems. Must have experience with cloud services. Hybrid, full-time. Two days per week in the office.</p></main>' }),
    extract: async () => ({ company: 'Example Ltd', title: 'Forged title', description: 'Build reliable software systems. Must have experience with cloud services.', notes: 'untrusted extra field' }),
    assess: async ({ candidate, prompt: value }) => { prompt = value; return assessment(candidate); },
  }));
  assert.equal(result.status, 'imported');
  assert.equal(result.entry.role, 'Engineer at Example Ltd');
  assert.equal(result.entry.availability, 'unverified');
  assert.equal(result.entry.advertFacts.sourceUrl, 'https://jobs.example.test/role/1');
  assert.equal(result.entry.advertFacts.hours, 'full-time');
  assert.equal(result.entry.advertFacts.workingPattern, 'hybrid');
  assert.equal(result.entry.advertFacts.officeDays, 2);
  assert.equal(Object.hasOwn(result.entry.advertFacts, 'title'), false);
  assert.doesNotMatch(JSON.stringify(result.entry), /untrusted extra field/);
  assert.doesNotMatch(prompt, /session=secret|job=role-1/);
});

test('expired source facts mark imported vacancy closed and remain attached', async () => {
  const expiredHtml = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', description: 'Build reliable software systems. Must have experience with cloud services. Full-time.', hiringOrganization: { name: 'Example Ltd' }, url: 'https://jobs.example.test/role/1', validThrough: '2026-10-01' })}</script><p>Build reliable software systems.</p>`;
  const result = await importJobFromUrl(options({
    fetchResource: async () => ({ ok: true, status: 200, text: async () => expiredHtml.replace('<p>Build reliable software systems.</p>', '<p>Build reliable software systems. Full-time.</p>') }),
    extract: async ({ text }) => ({ company: 'Example Ltd', title: 'Engineer', description: text }),
    assess: async ({ candidate }) => assessment(candidate),
  }));
  assert.equal(result.status, 'imported');
  assert.equal(result.entry.availability, 'closed');
  assert.equal(result.entry.advertFacts.sourceUrl, 'https://jobs.example.test/role/1');
  assert.equal(Object.hasOwn(result.entry.advertFacts, 'validThrough'), false);
  assert.match(result.warnings.join(' '), /expired closing date/i);
  assert.equal(result.entry.advertFacts.availability, 'gone');
  assert.match(result.entry.notes, /expired closing date/i);
});

test('retains source work mode, full-time schedule, and salary evidence when canonical fields are unknown', async () => {
  const html = '<title>Editor at Example Ltd</title><main><p>Hybrid work. £32,000 - £40,197. Full-time. Two days each week in the office.</p></main>';
  const result = await importJobFromUrl(options({
    fetchResource: async () => ({ ok: true, status: 200, text: async () => html }),
    extract: async () => ({ company: 'Example Ltd', title: 'Editor', description: 'Write clear product guides.', employmentType: 'FULL_TIME' }),
    assess: async ({ candidate }) => assessment(candidate),
  }));
  assert.equal(result.status, 'imported', JSON.stringify(result));
  assert.equal(result.entry.advertFacts.workingPattern, 'hybrid');
  assert.equal(result.entry.advertFacts.hours, 'full-time');
  assert.match(result.entry.notes, /Advert salary evidence: £32,000/);
});

test('profile hard exclusion overrides action score while preserving the assessment and reason', async () => {
  const result = await importJobFromUrl(options({
    profile: { status: 'published', id: 'profile-1', negative: { excludedTitles: [
      { value: 'Engineer', strength: 'hard-exclusion', provenance: 'explicit' },
    ] } },
    assess: async ({ candidate }) => ({ ...assessment(candidate),
      strengths: [{ point: 'Strong fit', advertEvidence: 'Build reliable software systems.', profileEvidence: 'Relevant experience is recorded.' }],
      concerns: [{ point: 'Role scope unclear', advertEvidence: 'Build reliable software systems.', profileEvidence: null }],
    }),
  }));
  assert.equal(result.status, 'imported');
  assert.equal(result.entry.score, 0);
  assert.equal(result.entry.eligibility.status, 'ineligible');
  assert.match(result.entry.eligibility.reasons.join(' '), /Profile exclusion \(excluded-title\)/);
  assert.match(result.entry.notes, /Strengths: Strong fit/);
  assert.match(result.entry.notes, /Concerns: Role scope unclear/);
  assert.match(result.entry.notes, /Profile exclusions: excluded-title/);
});
