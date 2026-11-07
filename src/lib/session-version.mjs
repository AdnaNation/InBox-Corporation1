export function isSessionVersionValid(tokenVersion, currentVersion) {
  const token = Number.isSafeInteger(tokenVersion) ? tokenVersion : 0;
  const current = Number.isSafeInteger(currentVersion) ? currentVersion : 0;
  return token === current;
}
