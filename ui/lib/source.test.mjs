import test from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlToText, extractJobFacts, buildSourcePayload, sourceUrlOf, sourceUrlsOf, fetchEntrySource,
  SourceCache, THIN_TEXT_CHARS,
} from './source.mjs';

test('htmlToText strips scripts/styles/nav, decodes entities, keeps paragraph breaks', () => {
  const html = `<html><head><title>T</title><style>.x{color:red}</style>
    <script>var a = "<p>not text</p>";</script></head>
    <body><nav><a href="/">Home</a></nav>
    <p>Salary: &pound;80,000 &amp; equity</p>
    <div>Second   block</div>
    <footer>ignore me</footer></body></html>`;
  const text = htmlToText(html);
  assert.ok(text.includes('Salary: £80,000 & equity'));
  assert.ok(text.includes('Second block'));
  assert.ok(!text.includes('not text'));
  assert.ok(!text.includes('color:red'));
  assert.ok(!text.includes('ignore me'));
  assert.ok(!text.includes('Home'));
  // p and div are separate lines
  assert.ok(/£80,000 & equity\n+Second block/.test(text));
});

test('htmlToText collapses blank-line runs and handles numeric entities', () => {
  const text = htmlToText('<p>a&#8211;b</p><p></p><p></p><p>&#x27;quoted&#x27;</p><p>close &times; 3&middot;5&trade; &bull; x</p>');
  assert.ok(text.includes('a–b'));
  assert.ok(text.includes("'quoted'"));
  assert.ok(text.includes('close × 3·5™ • x'));
  assert.ok(!/\n{3,}/.test(text));
});

test('extractJobFacts reads a JSON-LD JobPosting object', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting',
    title: 'Senior Hardware Engineer',
    baseSalary: { '@type': 'MonetaryAmount', currency: 'GBP',
      value: { '@type': 'QuantitativeValue', minValue: 70000, maxValue: 90000, unitText: 'YEAR' } },
    jobLocation: { '@type': 'Place', address: { addressLocality: 'Cambridge', addressCountry: 'UK' } },
    employmentType: 'FULL_TIME',
    datePosted: '2026-07-01', validThrough: '2026-08-01T23:59',
  })}</script><body><p>blah</p></body>`;
  const f = extractJobFacts(html);
  assert.equal(f.title, 'Senior Hardware Engineer');
  assert.equal(f.salary, 'GBP 70000–90000 per year');
  assert.equal(f.location, 'Cambridge, UK');
  assert.equal(f.employmentType, 'FULL_TIME');
  assert.equal(f.datePosted, '2026-07-01');
  assert.equal(f.validThrough, '2026-08-01');
});

test('extractJobFacts finds JobPosting inside arrays and @graph', () => {
  const graph = { '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization', name: 'X' }, { '@type': ['JobPosting'], title: 'Graph Job' }] };
  const arr = [{ '@type': 'WebSite' }, { '@type': 'JobPosting', title: 'Array Job' }];
  assert.equal(extractJobFacts(`<script type="application/ld+json">${JSON.stringify(graph)}</script>`).title, 'Graph Job');
  assert.equal(extractJobFacts(`<script type="application/ld+json">${JSON.stringify(arr)}</script>`).title, 'Array Job');
});

test('extractJobFacts ignores malformed JSON-LD and falls back to heuristics', () => {
  const html = `<script type="application/ld+json">{not json</script>
    <title>Fallback Title | Careers</title>
    <body><p>We offer £70,000 - £90,000 depending on experience. Hybrid working.</p>
    <p>Closing date: 31 July 2026</p></body>`;
  const f = extractJobFacts(html);
  assert.equal(f.title, 'Fallback Title | Careers');
  assert.ok(f.salary.startsWith('£70,000'));
  assert.equal(f.workMode, 'hybrid');
  assert.ok(f.validThrough.includes('31 July 2026'));
});

test('extractJobFacts returns empty object when nothing is found', () => {
  assert.deepEqual(extractJobFacts('<body><p>hello world</p></body>'), {});
});

test('extractJobFacts does not mistake funding amounts for salaries', () => {
  assert.equal(extractJobFacts('<body><p>raised $11 million at a $1B valuation</p></body>').salary, undefined);
  assert.equal(extractJobFacts('<body><p>after an £8m seed round</p></body>').salary, undefined);
  assert.equal(extractJobFacts('<body><p>paying £70k plus equity</p></body>').salary, '£70k');
  assert.equal(extractJobFacts('<body><p>salary £85000 DOE</p></body>').salary, '£85000');
});

test('buildSourcePayload flags thin text and carries url/fetchedAt', () => {
  const p = buildSourcePayload('<body><p>tiny</p></body>', 'https://x.test/job', '2026-07-10T12:00:00.000Z');
  assert.equal(p.ok, true);
  assert.equal(p.url, 'https://x.test/job');
  assert.equal(p.fetchedAt, '2026-07-10T12:00:00.000Z');
  assert.equal(p.thin, true);
  const long = `<body><p>${'word '.repeat(THIN_TEXT_CHARS)}</p></body>`;
  assert.equal(buildSourcePayload(long, 'https://x.test', 'now').thin, false);
});

test('buildSourcePayload never publishes URL credentials, query values or fragments', () => {
  const payload = buildSourcePayload(
    '<body><p>vacancy</p></body>',
    'https://user:password@x.test/job?sig=PRIVATE123#token',
    '2026-07-31T12:00:00.000Z',
  );
  assert.equal(payload.url, 'https://x.test/job');
  assert.doesNotMatch(JSON.stringify(payload), /user|password|PRIVATE123|token/);
});

test('sourceUrlOf returns the first http(s) source or null', () => {
  assert.equal(sourceUrlOf({ sources: ['https://a.test/x', 'https://b.test'] }), 'https://a.test/x');
  assert.equal(sourceUrlOf({ sources: ['javascript:alert(1)'] }), null);
  assert.equal(sourceUrlOf({ sources: [] }), null);
  assert.equal(sourceUrlOf({}), null);
  assert.equal(sourceUrlOf(null), null);
});

test('sourceUrlsOf returns unique safe saved sources, bounded to three', () => {
  assert.deepEqual(sourceUrlsOf({ sources: [
    'javascript:alert(1)', 'https://user:secret@unsafe.test/job', 'https://a.test/job',
    'https://a.test/job', 'https://b.test/job', 'https://c.test/job', 'https://d.test/job',
  ] }), ['https://a.test/job', 'https://b.test/job', 'https://c.test/job']);
  assert.equal(sourceUrlOf({ sources: ['javascript:alert(1)', 'https://b.test/job'] }), 'https://b.test/job');
});

test('fetchEntrySource tries saved alternatives after HTTP failure and marks fallback success', async () => {
  const attempted = [];
  const result = await fetchEntrySource({ sources: ['https://adzuna.test/out', 'https://employer.test/job'] }, {
    now: () => '2026-10-24T12:00:00.000Z',
    fetchResource: async (url, options) => {
      attempted.push({ url, options });
      return url.includes('adzuna') ? { ok: false, status: 403 } : { ok: true, text: async () => '<p>Current job advert</p>' };
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.url, 'https://employer.test/job');
  assert.equal(result.payload.fallbackUsed, true);
  assert.equal(attempted.length, 2);
  assert.deepEqual(attempted[0].options, {
    timeoutMs: 10000, maxBytes: 1_000_000, maxRedirects: 4,
    allowedContentTypes: ['text/html', 'application/xhtml+xml', 'application/xml', 'text/plain'],
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
});

test('fetchEntrySource preserves the first failure and never attempts more than three saved URLs', async () => {
  const attempted = [];
  const result = await fetchEntrySource({ sources: [
    'https://a.test/1', 'https://b.test/2', 'https://c.test/3', 'https://d.test/4',
  ] }, {
    fetchResource: async (url) => {
      attempted.push(url);
      if (url.includes('a.test')) throw Object.assign(new Error('blocked'), { reasonCode: 'unsafe-destination' });
      throw new Error('network down');
    },
  });
  assert.equal(attempted.length, 3);
  assert.deepEqual(result, {
    status: 502,
    payload: { ok: false, error: 'Source could not be fetched.', reasonCode: 'unsafe-destination' },
  });
});

test('fetchEntrySource keeps timeout and HTTP response failures distinct', async () => {
  const timedOut = await fetchEntrySource({ sources: ['https://a.test/1'] }, {
    fetchResource: async () => { throw Object.assign(new Error('timeout'), { reasonCode: 'request-timeout' }); },
  });
  const rejected = await fetchEntrySource({ sources: ['https://a.test/1'] }, {
    fetchResource: async () => ({ ok: false, status: 403 }),
  });
  assert.equal(timedOut.payload.reasonCode, 'source-timeout');
  assert.equal(timedOut.payload.error, 'Source request timed out.');
  assert.deepEqual(rejected.payload, { ok: false, error: 'source returned 403' });
});

test('SourceCache expires entries after the TTL', () => {
  let t = 1000;
  const cache = new SourceCache(3600000, () => t);
  cache.set('id1', { v: 1 });
  assert.deepEqual(cache.get('id1'), { v: 1 });
  t += 3600000 + 1;
  assert.equal(cache.get('id1'), null);
  assert.equal(cache.get('missing'), null);
});
