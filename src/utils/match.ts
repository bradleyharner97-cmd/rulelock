import picomatch from "picomatch";

export function matchesPath(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => picomatch.isMatch(file, pattern, { dot: true }));
}

export function matchingPattern(file: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => picomatch.isMatch(file, pattern, { dot: true }));
}
