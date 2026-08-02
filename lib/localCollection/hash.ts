function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = stableValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function deterministicHash(value: unknown): string {
  const text = stableStringify(value);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const unsigned = h1 >>> 0;
  return unsigned.toString(16).padStart(8, "0");
}
