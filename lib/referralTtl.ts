const SECONDS_PER_DAY = 24 * 60 * 60;

function toEpochSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function getUnconvertedSessionExpiresAt(from = new Date()) {
  return toEpochSeconds(
    new Date(from.getTime() + 90 * SECONDS_PER_DAY * 1000),
  );
}

export function getConvertedSessionExpiresAt(from = new Date()) {
  const expiresAt = new Date(from);
  expiresAt.setMonth(expiresAt.getMonth() + 24);

  return toEpochSeconds(expiresAt);
}

export function getClaimWindowEndsAt(from = new Date()) {
  const claimWindowEndsAt = new Date(from);
  claimWindowEndsAt.setMonth(claimWindowEndsAt.getMonth() + 12);

  return claimWindowEndsAt.toISOString();
}

export function getRetainUntil(from = new Date()) {
  const retainUntil = new Date(from);
  retainUntil.setFullYear(retainUntil.getFullYear() + 7);

  return retainUntil.toISOString();
}
