const SECONDS_PER_DAY = 24 * 60 * 60;

function toEpochSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function getUnconvertedSessionExpiresAt(from = new Date()) {
  return toEpochSeconds(
    new Date(from.getTime() + 90 * SECONDS_PER_DAY * 1000),
  );
}

export function getConvertedReferralExpiresAt(from = new Date()) {
  const expiresAt = new Date(from);
  expiresAt.setMonth(expiresAt.getMonth() + 24);

  return toEpochSeconds(expiresAt);
}
