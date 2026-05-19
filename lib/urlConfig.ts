const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

type AllowedUrlOptions = {
  envName: string;
  fallback: string;
  allowedHosts: readonly string[];
  allowLocalhostInDevelopment?: boolean;
};

function getAllowedUrl({
  envName,
  fallback,
  allowedHosts,
  allowLocalhostInDevelopment = true,
}: AllowedUrlOptions) {
  const rawValue = process.env[envName]?.trim() || fallback;
  const parsedUrl = new URL(rawValue);
  const allowedHostSet = new Set(allowedHosts);
  const isLocalhost =
    process.env.NODE_ENV !== "production" &&
    allowLocalhostInDevelopment &&
    LOCAL_HOSTS.includes(parsedUrl.hostname);

  if (parsedUrl.protocol !== "https:" && !isLocalhost) {
    throw new Error(`${envName} must use https.`);
  }

  if (!allowedHostSet.has(parsedUrl.hostname) && !isLocalhost) {
    throw new Error(`${envName} host is not allowed.`);
  }

  return parsedUrl;
}

export function getReferralBaseUrl() {
  return getAllowedUrl({
    envName: "BASE_URL",
    fallback: "https://go.alertahome.com/",
    allowedHosts: ["go.alertahome.com"],
  });
}

export function getReferralUrl(referralId: string) {
  return new URL(referralId, getReferralBaseUrl()).toString();
}

export function getShopifyHomeUrl() {
  return getAllowedUrl({
    envName: "SHOPIFY_HOME_URL",
    fallback: "https://www.alertahome.com/",
    allowedHosts: ["www.alertahome.com", "alertahome.com"],
  });
}
