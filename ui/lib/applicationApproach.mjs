import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from './atomicWrite.mjs';

export const MAX_APPLICATION_APPROACH_BYTES = 100_000;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

export function applicationApproachRelativePath(entry) {
  const id = String(entry?.id ?? '');
  if (!SAFE_ID.test(id)) throw new Error('Invalid opportunity id');
  return path.posix.join('applications', id, 'application-approach.md');
}

function checkedTarget(root, entry, { create = false } = {}) {
  const base = path.resolve(root);
  const relativePath = applicationApproachRelativePath(entry);
  if (!fs.existsSync(base) && !create) return { file: path.join(base, relativePath), relativePath, exists: false };
  if (create) fs.mkdirSync(base, { recursive: true });
  if (fs.lstatSync(base).isSymbolicLink()) throw new Error('Application approach workspace root cannot be a symlink');
  const realBase = fs.realpathSync(base);
  const segments = relativePath.split('/');
  let current = realBase;
  for (let i = 0; i < segments.length; i += 1) {
    current = path.join(current, segments[i]);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error('Application approach path contains a symlink');
      if (i < segments.length - 1 && !stat.isDirectory()) throw new Error('Application approach parent is not a directory');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return { file: path.join(realBase, relativePath), relativePath, exists: false };
      if (i < segments.length - 1) fs.mkdirSync(current);
    }
    if (fs.existsSync(current)) {
      const real = fs.realpathSync(current);
      const relative = path.relative(realBase, real);
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Application approach path escapes workspace');
    }
  }
  return { file: current, relativePath, exists: fs.existsSync(current) };
}

function artifact(file, relativePath, exists, content = '') {
  return { exists, path: relativePath, content, updatedAt: exists ? fs.statSync(file).mtime.toISOString() : null };
}

export function readApplicationApproach(root, entry) {
  const target = checkedTarget(root, entry);
  if (!target.exists) return artifact(target.file, target.relativePath, false);
  const stat = fs.statSync(target.file);
  if (!stat.isFile()) throw new Error('Application approach must be a regular file');
  if (stat.size > MAX_APPLICATION_APPROACH_BYTES) throw new Error('Application approach exceeds 100000 UTF-8 bytes');
  const bytes = fs.readFileSync(target.file);
  if (bytes.length > MAX_APPLICATION_APPROACH_BYTES) throw new Error('Application approach exceeds 100000 UTF-8 bytes');
  return artifact(target.file, target.relativePath, true, bytes.toString('utf8'));
}

export function writeApplicationApproach(root, entry, text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Application approach must be nonblank text');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > MAX_APPLICATION_APPROACH_BYTES) throw new Error('Application approach exceeds 100000 UTF-8 bytes');
  const target = checkedTarget(root, entry, { create: true });
  atomicWriteFile(target.file, bytes, { mode: 0o600 });
  return artifact(target.file, target.relativePath, true, text);
}
