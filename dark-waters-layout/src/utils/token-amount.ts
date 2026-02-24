export function parseTokenAmountToUnits(amount: string, decimals: number): bigint | null {
  const normalized = amount.trim()
  if (!normalized) return null
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  if (decimals < 0) return null

  const [wholePart, fractionalPart = ""] = normalized.split(".")
  if (fractionalPart.length > decimals) return null

  const scale = BigInt(`1${"0".repeat(decimals)}`)
  const wholeUnits = BigInt(wholePart) * scale
  const fraction = fractionalPart.padEnd(decimals, "0")
  const fractionalUnits = fraction.length > 0 ? BigInt(fraction) : BigInt(0)

  return wholeUnits + fractionalUnits
}

export function formatTokenAmountFromUnits(
  units: string | bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  const normalizedUnits = typeof units === "bigint" ? units : BigInt(units || "0")
  if (decimals <= 0) return normalizedUnits.toString()

  const divisor = BigInt(`1${"0".repeat(decimals)}`)
  const whole = normalizedUnits / divisor
  const fraction = normalizedUnits % divisor

  if (fraction === BigInt(0)) return whole.toString()

  const rawFraction = fraction.toString().padStart(decimals, "0")
  const trimmed = rawFraction.replace(/0+$/, "")
  const clipped = trimmed.slice(0, Math.max(0, maxFractionDigits))

  return clipped.length > 0 ? `${whole.toString()}.${clipped}` : whole.toString()
}
