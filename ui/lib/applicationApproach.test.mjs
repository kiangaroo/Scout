import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applicationApproachRelativePath, readApplicationApproach, writeApplicationApproach, MAX_APPLICATION_APPROACH_BYTES } from './applicationApproach.mjs';
function fixture(run) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-approach-')); try { return run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
const entry = { id: 'acme-engineer-2026-10', company: 'Acme', role: 'Engineer' };

test('two roles at one employer retain independent plans', () => fixture((root) => {
  const second = { ...entry, id: 'acme-editor-2026-10', role: 'Editor' };
  writeApplicationApproach(root, entry, '# Engineering plan');
  writeApplicationApproach(root, second, '# Editorial plan');
  assert.equal(readApplicationApproach(root, entry).content, '# Engineering plan');
  assert.equal(readApplicationApproach(root, second).content, '# Editorial plan');
}));
test('uses strict role-specific safe opportunity paths', () => { assert.equal(applicationApproachRelativePath(entry), 'applications/acme-engineer-2026-10/application-approach.md'); for (const id of ['../escape', 'Acme-Role', 'x/y', '.hidden', '']) assert.throws(() => applicationApproachRelativePath({ id })); });
test('missing read and bounded write/read roundtrip', () => fixture((root) => { const missing = readApplicationApproach(root, entry); assert.equal(missing.exists, false); assert.equal(missing.content, ''); const saved = writeApplicationApproach(root, entry, '# Plan\n'); assert.equal(saved.content, '# Plan\n'); assert.ok(saved.updatedAt); assert.equal(readApplicationApproach(root, entry).content, '# Plan\n'); assert.throws(() => writeApplicationApproach(root, entry, '  \n')); assert.throws(() => writeApplicationApproach(root, entry, 'x'.repeat(MAX_APPLICATION_APPROACH_BYTES + 1))); }));
test('rejects symlink components', () => fixture((root) => { const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-outside-')); try { fs.symlinkSync(outside, path.join(root, 'applications'), 'junction'); assert.throws(() => readApplicationApproach(root, entry)); assert.throws(() => writeApplicationApproach(root, entry, 'plan')); } finally { fs.rmSync(outside, { recursive: true, force: true }); } }));
test('rejects oversized file data on read', () => fixture((root) => { const file = path.join(root, applicationApproachRelativePath(entry)); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(MAX_APPLICATION_APPROACH_BYTES + 1)); assert.throws(() => readApplicationApproach(root, entry)); }));
test('missing root reads without creating it and reports the canonical relative path', () => {
  const root = path.join(os.tmpdir(), `scout-missing-${process.pid}-${Date.now()}`);
  const result = readApplicationApproach(root, entry);
  assert.equal(fs.existsSync(root), false);
  assert.equal(result.path, 'applications/acme-engineer-2026-10/application-approach.md');
  assert.equal(result.exists, false);
});

test('missing parent metadata points to canonical final relative path', () => fixture((root) => {
  const result = readApplicationApproach(root, entry);
  assert.equal(result.path, 'applications/acme-engineer-2026-10/application-approach.md');
}));
