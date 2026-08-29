export function resolveTestingReturnTo(value) {
  const requested = Array.isArray(value) ? value[0] : value;
  if (typeof requested !== "string") return "/";

  const destination = requested.trim();
  if (!destination.startsWith("/") || destination.startsWith("//") || destination.startsWith("/\\")) return "/";
  if (/^\/testing(?:[/?#]|$)/i.test(destination)) return "/";
  return destination;
}
