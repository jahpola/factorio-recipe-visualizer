export function finderRevealCommand(filename: string): string {
  return `open -R '${filename.replaceAll("'", "'\\''")}'`
}
