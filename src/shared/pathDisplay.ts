export function formatHomePathForDisplay(value: string): string {
  const windowsMatch = value.match(/^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/i)
  if (windowsMatch) return `~${windowsMatch[1] ?? ''}`

  const unixMatch = value.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/)
  if (unixMatch) return `~${unixMatch[1] ?? ''}`

  return value
}
