import { canonicaliseUrl } from './vacancyObservation.mjs';

const PERIODS = new Set(['year', 'month', 'week', 'day', 'hour', 'unknown']);
const RATE_TYPES = new Set(['salary', 'contract', 'unknown']);
const CERTAINTIES = new Set(['exact', 'range', 'estimated', 'unknown']);
const WORK_PATTERNS = new Set(['remote', 'hybrid', 'onsite']);
const EMPLOYMENT_TYPES = new Set(['permanent', 'contract', 'temporary', 'internship']);
const HOURS = new Set(['full-time', 'part-time']);
const OFFICE_DAY_WORDS = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
});

function enumValue(value, allowed, aliases = {}) {
  const text = String(value ?? '').trim().toLowerCase();
  const normalized = aliases[text] || text;
  return allowed.has(normalized) ? normalized : null;
}

function finiteAmount(value) {
  const number = value === null || value === undefined || value === '' ? null : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function canonicalSourceUrl(value) {
  const canonical = canonicaliseUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function compensationFact(value) {
  const source = value && typeof value === 'object' && Object.hasOwn(value, 'value')
    ? value.value : value;
  if (!source || typeof source !== 'object') return null;
  const minimum = finiteAmount(source.minimum);
  const maximum = finiteAmount(source.maximum);
  const currencyText = String(source.currency ?? '').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(currencyText) ? currencyText : null;
  if (minimum === null && maximum === null && currency === null) return null;
  return {
    minimum,
    maximum,
    currency,
    period: enumValue(source.period, PERIODS) || 'unknown',
    rateType: enumValue(source.rateType, RATE_TYPES) || 'unknown',
    certainty: enumValue(source.certainty, CERTAINTIES) || 'unknown',
  };
}

function fieldValue(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'value')
    ? value.value : value;
}

function officeDayCount(description) {
  const text = String(description || '').slice(0, 12_000).toLowerCase();
  const number = '(\\d|zero|one|two|three|four|five|six|seven)';
  const day = `(?:${number})\\s+days?`;
  const week = '(?:per|a|each)\\s+week';
  const office = '(?:(?:in|at)\\s+(?:the\\s+)?office|office\\s+days?)';
  const patterns = [
    new RegExp(`\\b${day}\\s+${week}(?:\\s+(?:are|spent|working|required)\\s+)?\\s*${office}\\b`, 'gi'),
    new RegExp(`\\b${office}\\s+(?:for\\s+)?${day}\\s+${week}\\b`, 'gi'),
    new RegExp(`\\b${day}\\s+${office}\\s+(?:each|per)\\s+week\\b`, 'gi'),
  ];
  const matches = patterns.flatMap((pattern) => [...text.matchAll(pattern)]);
  if (!matches.length) return null;
  const captured = matches.map((match) => {
    const prefix = text.slice(Math.max(0, match.index - 35), match.index);
    const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 20);
    if (/\b(?:between|up to|at least|no more than|maximum(?: of)?|minimum(?: of)?|not|rather than)\b/i.test(prefix)
      || /(?:\bor|\bto|\d\s*[-–])\s*$/i.test(prefix)
      || /^\s*(?:or|to)\b/i.test(suffix)) return null;
    const token = match[1]?.toLowerCase();
    const value = /^\d$/.test(token || '') ? Number(token) : OFFICE_DAY_WORDS[token];
    return Number.isInteger(value) && value >= 0 && value <= 7 ? value : null;
  }).filter((value) => value !== null);
  const unique = [...new Set(captured)];
  return unique.length === 1 ? unique[0] : null;
}

function hoursValue(description) {
  const text = String(description || '').slice(0, 12_000);
  const full = /\bfull[ -]?time\b/i.test(text);
  const part = /\bpart[ -]?time\b/i.test(text);
  if (full === part) return null;
  return full ? 'full-time' : 'part-time';
}

function checkedDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1] : null;
}

export function advertFacts({
  url,
  fetchedAt,
  compensation,
  workingPattern,
  employmentType,
  description,
} = {}) {
  const sourceUrl = canonicalSourceUrl(url);
  const pattern = enumValue(fieldValue(workingPattern), WORK_PATTERNS, {
    'on-site': 'onsite', 'on site': 'onsite', 'on_site': 'onsite',
  });
  const type = enumValue(fieldValue(employmentType), EMPLOYMENT_TYPES);
  return sanitizeAdvertFacts({
    compensation: compensationFact(compensation),
    workingPattern: pattern,
    employmentType: type,
    hours: hoursValue(description),
    officeDays: officeDayCount(description),
    sourceUrl,
    checkedAt: checkedDate(fetchedAt),
    availability: sourceUrl ? 'unverified' : null,
  });
}

export function sanitizeAdvertFacts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const officeDays = Number.isInteger(value.officeDays) && value.officeDays >= 0 && value.officeDays <= 7
    ? value.officeDays : null;
  const result = {
    compensation: compensationFact(value.compensation),
    workingPattern: enumValue(value.workingPattern, WORK_PATTERNS),
    employmentType: enumValue(value.employmentType, EMPLOYMENT_TYPES),
    hours: enumValue(value.hours, HOURS),
    officeDays,
    sourceUrl: canonicalSourceUrl(value.sourceUrl),
    checkedAt: checkedDate(value.checkedAt),
    availability: ['live', 'unverified', 'gone'].includes(value.availability) ? value.availability : null,
  };
  const hasInformativeFacts = result.compensation !== null
    || result.workingPattern !== null
    || result.employmentType !== null
    || result.hours !== null
    || result.officeDays !== null;
  return hasInformativeFacts ? result : null;
}

function mergeCompensation(previous, next) {
  if (!next) return previous || null;
  if (!previous) return next;
  const merged = { ...previous };
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (value !== null && value !== undefined && value !== 'unknown') merged[key] = value;
  }
  return merged;
}

export function mergeAdvertFacts(previous, next) {
  const safePrevious = sanitizeAdvertFacts(previous);
  const safeNext = sanitizeAdvertFacts(next);
  if (!safePrevious && !safeNext) return null;
  const result = { ...(safePrevious || {}), ...(safeNext || {}) };
  result.compensation = mergeCompensation(safePrevious?.compensation, safeNext?.compensation);
  for (const key of ['workingPattern', 'employmentType', 'hours', 'officeDays', 'sourceUrl', 'checkedAt', 'availability']) {
    if (safeNext?.[key] === null || safeNext?.[key] === undefined) result[key] = safePrevious?.[key] ?? null;
  }
  return result;
}
