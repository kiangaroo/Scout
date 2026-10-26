import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { setupReadiness } from './setupReadiness.mjs';
import { publishSearchProfile } from './searchProfile.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));
function fixture({ approved = false, history = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-ready-')); roots.push(root);
  const activatedFiles = [
    ['workspace.json', '{"synthetic":true}\n'],
    ['profile/context.md', 'x'.repeat(600)],
    ['profile/calibration.md', 'x'.repeat(150)],
    ['cv/master-cv.md', 'x'.repeat(600)],
    ['data/search-categories.json', '{"categories":[]}\n'],
  ];
  for (const [file, text] of activatedFiles) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text);
  }
  if (approved) {
    const activatedHashes = Object.fromEntries(activatedFiles.map(([file]) => [
      file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
    ]));
    fs.mkdirSync(path.join(root, '.scout/onboarding'), { recursive: true });
    fs.writeFileSync(path.join(root, '.scout/onboarding/activated.json'), JSON.stringify({ activatedHashes }));
  }
  return { root, tracker: { opportunities: history ? [{ id: 'legacy-role-2026-07' }] : [] } };
}
function publishedProfileFixture({ previousProfileId = null } = {}) {
  const f = fixture();
  const activatedAt = '2026-10-23T10:00:00.000Z';
  const stagedConfig = {
    setup: { completedAt: null },
    searchProfile: { schemaVersion: 1, publishedId: previousProfileId },
    ai: { provider: 'codex' },
  };
  const activeConfig = structuredClone(stagedConfig);
  activeConfig.setup.completedAt = activatedAt;
  fs.writeFileSync(path.join(f.root, 'workspace.json'), `${JSON.stringify(activeConfig, null, 2)}\n`);
  const activatedFiles = [
    'workspace.json', 'profile/context.md', 'profile/calibration.md',
    'cv/master-cv.md', 'data/search-categories.json',
  ];
  const activatedHashes = Object.fromEntries(activatedFiles.map((file) => [
    file, crypto.createHash('sha256').update(fs.readFileSync(path.join(f.root, file))).digest('hex'),
  ]));
  fs.mkdirSync(path.join(f.root, '.scout/onboarding'), { recursive: true });
  fs.writeFileSync(path.join(f.root, '.scout/onboarding/workspace.json'), `${JSON.stringify(stagedConfig, null, 2)}\n`);
  fs.writeFileSync(path.join(f.root, '.scout/onboarding/activated.json'), JSON.stringify({
    activatedAt,
    activatedHashes,
    stagedHashes: {
      'workspace.json': crypto.createHash('sha256').update(`${JSON.stringify(stagedConfig, null, 2)}\n`).digest('hex'),
    },
  }));
  const published = publishSearchProfile({
    version: 1,
    status: 'draft',
    target: { primaryTitles: [], locations: [], sectors: [] },
    negative: { excludedTitles: [], excludedResponsibilities: [] },
    compensation: {
      currency: null, period: 'year', minimum: null,
      minimumStrength: 'neutral', unknownPolicy: 'include',
    },
  }, { publishedAt: activatedAt });
  fs.mkdirSync(path.join(f.root, 'profile/search'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'profile/search/published.json'), `${JSON.stringify(published, null, 2)}\n`);
  activeConfig.searchProfile.publishedId = published.id;
  activeConfig._scoutMutation = {
    intendedDigest: 'a'.repeat(64), mutationId: 'mutation-test', mutationKey: 'b'.repeat(64),
    runKey: 'c'.repeat(64), schemaVersion: 1, targetKey: 'd'.repeat(64),
  };
  fs.writeFileSync(path.join(f.root, 'workspace.json'), `${JSON.stringify(activeConfig, null, 2)}\n`);
  return { ...f, activatedAt, activeConfig, published };
}
const config = { profile: { displayName: 'Sam' }, search: { roleFamilies: ['Software Engineer'], locations: ['Remote'], exclusions: [], salaryMinimum: null }, ai: { provider: 'codex' } };
const providers = { codex: { installed: true, authenticated: true } };
test('fresh setup requires explicit activation evidence', () => { const f = fixture(); assert.equal(setupReadiness(f.root, config, providers, f.tracker).ready, false); });
test('approved profession-neutral setup is ready with an empty tracker', () => { const f = fixture({ approved: true }); assert.equal(setupReadiness(f.root, config, providers, f.tracker).ready, true); });
test('established beta workspaces are grandfathered without resetting', () => { const f = fixture({ history: true }); const r = setupReadiness(f.root, config, providers, f.tracker); assert.equal(r.established, true); assert.equal(r.ready, true); });
test('missing provider authentication blocks readiness', () => { const f = fixture({ approved: true }); assert.equal(setupReadiness(f.root, config, { codex: { installed: true, authenticated: false } }, f.tracker).ready, false); });
test('authenticated provider with an outdated CLI blocks bounded setup', () => { const f = fixture({ approved: true }); assert.equal(setupReadiness(f.root, config, { codex: { installed: true, authenticated: true, capabilities: { structuredOutput: false } } }, f.tracker).ready, false); });
test('an activation marker cannot approve files that changed after activation', () => {
  const f = fixture({ approved: true });
  fs.appendFileSync(path.join(f.root, 'profile/context.md'), 'changed');
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).ready, false);
});
test('a valid published profile preserves approval after the publication config mutation', () => {
  const f = publishedProfileFixture();
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, true);
});
test('publication preserves a reviewed retuning baseline with a previous profile reference', () => {
  const f = publishedProfileFixture({ previousProfileId: 'profile-111111111111' });
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, true);
});
test('published profile allowance still rejects unrelated workspace config changes', () => {
  const f = publishedProfileFixture();
  f.activeConfig.ai.provider = 'claude';
  fs.writeFileSync(path.join(f.root, 'workspace.json'), `${JSON.stringify(f.activeConfig, null, 2)}\n`);
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, false);
});
test('published profile allowance still rejects changed activated evidence files', () => {
  for (const relative of ['profile/context.md', 'cv/master-cv.md']) {
    const f = publishedProfileFixture();
    fs.appendFileSync(path.join(f.root, relative), '\ntampered');
    assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, false, relative);
  }
});
test('published profile allowance rejects missing or malformed activation hashes', () => {
  for (const relative of ['workspace.json', 'profile/calibration.md']) {
  for (const expected of [undefined, 'not-a-sha256']) {
    const f = publishedProfileFixture();
    const markerFile = path.join(f.root, '.scout/onboarding/activated.json');
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    if (expected === undefined) delete marker.activatedHashes[relative];
    else marker.activatedHashes[relative] = expected;
    fs.writeFileSync(markerFile, JSON.stringify(marker));
    assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, false);
  }
  }
});
test('published profile allowance rejects a changed staged config baseline', () => {
  const f = publishedProfileFixture();
  const markerFile = path.join(f.root, '.scout/onboarding/activated.json');
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.stagedHashes['workspace.json'] = 'e'.repeat(64);
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, false);
});
test('published profile allowance rejects a changed or mismatched published profile', () => {
  const f = publishedProfileFixture();
  const profileFile = path.join(f.root, 'profile/search/published.json');
  const changed = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  changed.target.primaryTitles.push({ value: 'tampered', strength: 'strong-preference', provenance: 'explicit' });
  fs.writeFileSync(profileFile, `${JSON.stringify(changed, null, 2)}\n`);
  assert.equal(setupReadiness(f.root, config, providers, f.tracker).checks.approved, false);

  const g = publishedProfileFixture();
  g.activeConfig.searchProfile.publishedId = 'profile-000000000000';
  fs.writeFileSync(path.join(g.root, 'workspace.json'), `${JSON.stringify(g.activeConfig, null, 2)}\n`);
  assert.equal(setupReadiness(g.root, config, providers, g.tracker).checks.approved, false);
});
