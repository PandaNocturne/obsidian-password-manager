export function normalizeSearchKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

export function includesKeyword(value: string, keyword: string) {
  return value.toLowerCase().includes(keyword);
}