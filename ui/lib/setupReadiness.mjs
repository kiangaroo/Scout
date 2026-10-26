import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadPublishedSearchProfile } from './searchProfile.mjs';

const ACTIVATED_FILES = [
  'workspace.json', 'profile/context.md', 'profile/calibration.md',
  'cv/master-cv.md', 'data/search-categories.json',
];

function meaningful(file, minimumBytes) {
  return fs.existsSync(file) && fs.statSync(file).size >= minimumBytes;
}

function publishedWorkspaceConfigMatchesStage(root, marker) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'));
    const mutation = config._scoutMutation;
    if (!mutation || Object.getPrototypeOf(mutation) !== Object.prototype
      || Object.keys(mutation).sort().join(',') !== 'intendedDigest,mutationId,mutationKey,runKey,schemaVersion,targetKey'
      || mutation.schemaVersion !== 1
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(mutation.mutationId || '')
      || ['intendedDigest', 'mutationKey', 'runKey', 'targetKey'].some((key) => !/^[a-f0-9]{64}$/.test(mutation[key] || ''))) return false;

    const published = loadPublishedSearchProfile(root);
    if (!published || config.searchProfile?.publishedId !== published.id
      || typeof marker?.activatedAt !== 'string'
      || config.setup?.completedAt !== marker.activatedAt) return false;

    const expected = marker?.stagedHashes?.['workspace.json'];
    const stagedText = fs.readFileSync(path.join(root, '.scout', 'onboarding', 'workspace.json'), 'utf8');
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)
      || crypto.createHash('sha256').update(stagedText).digest('hex') !== expected) return false;
    const staged = JSON.parse(stagedText);
    const activated = { ...staged, setup: { ...staged.setup, completedAt: marker.activatedAt } };
    if (crypto.createHash('sha256').update(`${JSON.stringify(activated, null, 2)}\n`).digest('hex')
      !== marker.activatedHashes['workspace.json']) return false;
    const comparable = structuredClone(config);
    delete comparable._scoutMutation;
    comparable.setup = { ...comparable.setup, completedAt: staged.setup?.completedAt };
    comparable.searchProfile = { ...comparable.searchProfile, publishedId: staged.searchProfile?.publishedId };
    return isDeepStrictEqual(comparable, staged);
  } catch {
    return false;
  }
}

function activatedApproval(root) {
  const file = path.join(root, '.scout', 'onboarding', 'activated.json');
  let marker;
  try { marker = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  try {
    return ACTIVATED_FILES.every((relative) => {
      const target = path.join(root, ...relative.split('/'));
      const expected = marker?.activatedHashes?.[relative];
      if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false;
      if (!fs.existsSync(target) || !fs.lstatSync(target).isFile()) return false;
      const hashMatches = typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected)
        && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') === expected;
      return hashMatches || (relative === 'workspace.json' && publishedWorkspaceConfigMatchesStage(root, marker));
    });
  } catch {
    return false;
  }
}

export function setupReadiness(root, config, providers, tracker) {
  const opportunities = Array.isArray(tracker?.opportunities) ? tracker.opportunities : [];
  const provider = config.ai?.provider;
  const providerReady = Boolean(provider && providers?.[provider]?.installed && providers?.[provider]?.authenticated
    && providers?.[provider]?.capabilities?.structuredOutput !== false);
  const preferencesReady = Boolean(
    config.profile?.displayName
    && config.search?.roleFamilies?.length
    && config.search?.locations?.length
    && Array.isArray(config.search?.exclusions)
    && Object.hasOwn(config.search || {}, 'salaryMinimum')
  );
  const evidenceReady = meaningful(path.join(root, 'profile', 'context.md'), 150)
    && meaningful(path.join(root, 'profile', 'calibration.md'), 100)
    && meaningful(path.join(root, 'cv', 'master-cv.md'), 500);
  const approved = activatedApproval(root) || (opportunities.length > 0 && evidenceReady);
  const checks = { provider: providerReady, preferences: preferencesReady, evidence: evidenceReady, approved, tracker: Boolean(tracker) };
  return { checks, established: opportunities.length > 0 && evidenceReady, ready: Object.values(checks).every(Boolean) };
}
