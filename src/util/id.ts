export function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}