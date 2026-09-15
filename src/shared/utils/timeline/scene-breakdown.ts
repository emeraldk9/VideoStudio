export function normalizeHeading(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/[\s\---]+$/, '')
    .trim();
}
