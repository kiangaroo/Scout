import { isIP } from 'node:net';

const COMPANY_LIMIT = 120;
const ROLE_LIMIT = 160;
const LOCATION_LIMIT = 160;
const INTEREST_LIMIT = 1000;

function requiredText(value, label, limit) {
  if (typeof value !== 'string') throw new TypeError(`${label} is required`);
  const text = value.trim();
  if (!text || text.length > limit) throw new TypeError(`${label} must be 1-${limit} characters`);
  return text;
}

function optionalText(value, label, limit) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
  const text = value.trim();
  if (text.length > limit) throw new TypeError(`${label} must be at most ${limit} characters`);
  return text;
}

function normalizedEmployerName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'employer';
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '::' || normalized === '::1'
    || normalized.startsWith('fc') || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('::ffff:');
}

function publicCareersUrl(value) {
  if (typeof value !== 'string') throw new TypeError('careers URL is required');
  let url;
  try { url = new URL(value.trim()); } catch { throw new TypeError('careers URL must be a public HTTPS URL'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || (url.port && url.port !== '443') || !hostname || hostname.includes('%')
    || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal')
    || (!ipVersion && !hostname.includes('.'))
    || (ipVersion === 4 && isPrivateIpv4(hostname))
    || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new TypeError('careers URL must be a public HTTPS URL without credentials, query, or fragment');
  }
  return url.href;
}

function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TypeError('creation date must be YYYY-MM-DD');
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) {
    throw new TypeError('creation date must be a real calendar date');
  }
  return text;
}

/** Add a manually researched employer prospect without inventing a vacancy or fit score. */
export function addSpeculativeProspect(tracker, input, date) {
  if (!tracker || typeof tracker !== 'object' || !Array.isArray(tracker.opportunities)) {
    throw new TypeError('tracker opportunities are required');
  }
  const company = requiredText(input?.company, 'company', COMPANY_LIMIT);
  const careersUrl = publicCareersUrl(input?.careersUrl);
  const interest = requiredText(input?.interest, 'interest rationale', INTEREST_LIMIT);
  const roleFocus = optionalText(input?.roleFocus, 'role focus', ROLE_LIMIT);
  const location = optionalText(input?.location, 'location', LOCATION_LIMIT);
  const createdAt = validDate(date);
  const employerKey = normalizedEmployerName(company);

  const duplicate = tracker.opportunities.some((entry) => (
    (entry?.type === 'employer-prospect' || entry?.opportunityKind === 'employer-prospect')
    && normalizedEmployerName(entry.company) === employerKey
  ));
  if (duplicate) throw new Error('duplicate employer prospect for this company');

  const baseId = `${slug(company)}-speculative-${createdAt.slice(0, 7)}`;
  const usedIds = new Set(tracker.opportunities.map(({ id }) => id).filter(Boolean));
  let id = baseId;
  for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;

  const prospect = {
    id,
    company,
    role: roleFocus ? `Speculative enquiry — ${roleFocus}` : 'Speculative enquiry',
    location,
    score: null,
    type: 'employer-prospect',
    opportunityKind: 'employer-prospect',
    status: 'new',
    tags: ['Speculative Outreach'],
    createdAt,
    lastChecked: null,
    sources: [careersUrl],
    notes: interest,
  };
  const next = structuredClone(tracker);
  next.opportunities.push(prospect);
  next.updated = createdAt;
  return next;
}
