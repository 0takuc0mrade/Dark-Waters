export function normalizeAddress(address: string): string | null {
  try {
    const normalized = `0x${BigInt(address).toString(16)}`
    return normalized
  } catch {
    return null
  }
}

export function sameAddress(left: string, right: string): boolean {
  const normalizedLeft = normalizeAddress(left)
  const normalizedRight = normalizeAddress(right)
  if (!normalizedLeft || !normalizedRight) return false
  return normalizedLeft === normalizedRight
}
