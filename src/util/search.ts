export function normalizeSearchKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

export function parseSearchKeywords(keyword: string) {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/).filter(Boolean);
}

export function includesKeyword(value: string, keyword: string) {
  return value.toLowerCase().includes(keyword);
}

export function matchesAllKeywordsInValue(value: string, keywords: string[]) {
  if (!keywords.length) {
    return true;
  }
  const lower = value.toLowerCase();
  return keywords.every((keyword) => lower.includes(keyword));
}

export function matchesAnyFieldKeywords(fields: string[], keywords: string[]) {
  if (!keywords.length) {
    return true;
  }
  return keywords.every((keyword) => fields.some((field) => includesKeyword(field, keyword)));
}