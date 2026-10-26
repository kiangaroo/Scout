import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMutationRecipe, trackerMergeRecipe } from './scanMutationProjection.mjs';

const knownFacts = {
  compensation: {
    minimum: 65000, maximum: 75000, currency: 'GBP', period: 'year',
    rateType: 'salary', certainty: 'range',
  },
  workingPattern: 'hybrid', employmentType: 'permanent', hours: 'full-time',
  officeDays: 2, sourceUrl: 'https://jobs.example.test/role/123',
  checkedAt: '2026-10-24', availability: 'unverified',
};

test('tracker projection round-trips bounded advert facts without retaining arbitrary source text', () => {
  const current = JSON.stringify({ updated: '2026-10-23', opportunities: [] });
  const intended = JSON.stringify({
    updated: '2026-10-24',
    opportunities: [{
      id: 'sample-role-2026-10', company: 'Example Co', role: 'Producer',
      location: 'London', score: 70, status: 'new', sources: ['https://jobs.example.test/role/123'],
      advertFacts: {
        ...knownFacts,
        description: 'PRIVATE_FULL_ADVERT',
        rawText: 'PRIVATE_PROVIDER_RESPONSE',
        sourceUrl: 'https://jobs.example.test/role/123?token=secret',
      },
    }],
  });
  const recipe = trackerMergeRecipe(current, intended);
  assert.deepEqual(recipe.upserts[0].advertFacts, knownFacts);
  const written = JSON.parse(renderMutationRecipe('tracker', current, recipe));
  assert.deepEqual(written.opportunities[0].advertFacts, knownFacts);
  assert.doesNotMatch(JSON.stringify({ recipe, written }), /PRIVATE_FULL_ADVERT|PRIVATE_PROVIDER_RESPONSE|secret|token=/i);
});

test('legacy entries without advert facts remain valid and unknown scans keep prior facts', () => {
  const current = JSON.stringify({
    updated: '2026-10-23',
    opportunities: [{
      id: 'sample-role-2026-10', company: 'Example Co', role: 'Producer',
      status: 'new', advertFacts: knownFacts, sources: ['https://jobs.example.test/role/123'],
    }, {
      id: 'legacy-role-2026-10', company: 'Legacy Co', role: 'Coordinator',
      status: 'new', sources: ['https://jobs.example.test/role/456'],
    }],
  });
  const intended = JSON.stringify({
    updated: '2026-10-24',
    opportunities: [
      { id: 'sample-role-2026-10', company: 'Example Co', role: 'Producer', status: 'new' },
      { id: 'legacy-role-2026-10', company: 'Legacy Co', role: 'Coordinator', status: 'new' },
    ],
  });
  const recipe = trackerMergeRecipe(current, intended);
  assert.deepEqual(recipe.upserts[0].advertFacts, knownFacts);
  assert.equal(Object.hasOwn(recipe.upserts[1], 'advertFacts'), false);
  const written = JSON.parse(renderMutationRecipe('tracker', current, recipe));
  assert.deepEqual(written.opportunities[0].advertFacts, knownFacts);
  assert.equal(Object.hasOwn(written.opportunities[1], 'advertFacts'), false);
});
