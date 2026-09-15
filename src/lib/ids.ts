export function createId(_prefix?: string): string {
  return crypto.randomUUID();
}
