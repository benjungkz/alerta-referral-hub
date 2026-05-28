import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "@/lib/dynamodb";
import { createTimeoutSignal, getEnvTimeoutMs } from "@/lib/timeout";

const SHOPIFY_PROVIDER_PREFIX = "shopify";
const TOKEN_EXPIRY_BUFFER_MS = 10 * 60 * 1000;

type StoredShopifyToken = {
  provider: string;
  environment: string;
  access_token: string;
  expires_at: string;
  expires_in: number;
  scope: string;
  updated_at: string;
};

type ShopifyClientCredentialsResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function getTokensTableName() {
  return getRequiredEnv("APP_TOKENS_TABLE_NAME");
}

function getAppEnvironment() {
  const environment = process.env.ALERTA_ENV?.trim().toLowerCase() || "dev";

  if (!["dev", "prod"].includes(environment)) {
    throw new Error("ALERTA_ENV must be either dev or prod.");
  }

  return environment;
}

function getShopifyProviderKey() {
  return `${SHOPIFY_PROVIDER_PREFIX}#${getAppEnvironment()}`;
}

function getShopifyStoreDomain() {
  return getRequiredEnv("SHOPIFY_STORE_DOMAIN")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredShopifyToken(item: unknown) {
  if (!isRecord(item)) return undefined;

  const token = item as Partial<StoredShopifyToken>;
  const providerKey = getShopifyProviderKey();

  if (
    token.provider !== providerKey ||
    typeof token.environment !== "string" ||
    typeof token.access_token !== "string" ||
    typeof token.expires_at !== "string" ||
    typeof token.expires_in !== "number" ||
    typeof token.scope !== "string" ||
    typeof token.updated_at !== "string"
  ) {
    return undefined;
  }

  return token as StoredShopifyToken;
}

function isTokenValid(token: StoredShopifyToken, now = Date.now()) {
  const expiresAt = Date.parse(token.expires_at);

  return (
    Number.isFinite(expiresAt) && expiresAt - now > TOKEN_EXPIRY_BUFFER_MS
  );
}

async function getStoredShopifyToken() {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: getTokensTableName(),
      Key: {
        provider: getShopifyProviderKey(),
      },
    }),
  );

  return parseStoredShopifyToken(result.Item);
}

async function requestNewShopifyToken() {
  const storeDomain = getShopifyStoreDomain();
  const clientId = getRequiredEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SHOPIFY_CLIENT_SECRET");
  const timeout = createTimeoutSignal(
    getEnvTimeoutMs("SHOPIFY_TOKEN_TIMEOUT_MS", 15_000),
  );

  try {
    const response = await fetch(
      `https://${storeDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        cache: "no-store",
        signal: timeout.signal,
      },
    );

    const responseBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Shopify token request failed with status ${response.status}: ${responseBody}`,
      );
    }

    const data = JSON.parse(responseBody) as Partial<ShopifyClientCredentialsResponse>;

    if (
      typeof data.access_token !== "string" ||
      typeof data.expires_in !== "number"
    ) {
      throw new Error("Shopify token response was missing required fields.");
    }

    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      scope: typeof data.scope === "string" ? data.scope : "",
    };
  } finally {
    timeout.clear();
  }
}

async function saveShopifyToken(
  tokenResponse: ShopifyClientCredentialsResponse,
) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + tokenResponse.expires_in * 1000,
  ).toISOString();

  const item: StoredShopifyToken = {
    provider: getShopifyProviderKey(),
    environment: getAppEnvironment(),
    access_token: tokenResponse.access_token,
    expires_at: expiresAt,
    expires_in: tokenResponse.expires_in,
    scope: tokenResponse.scope || "",
    updated_at: now.toISOString(),
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: getTokensTableName(),
      Item: item,
    }),
  );

  return item;
}

export async function getShopifyAccessToken() {
  const storedToken = await getStoredShopifyToken();

  // Shopify Dev Dashboard client credentials tokens expire after about 24 hours,
  // so refresh before each Admin API call if the saved token is missing, expired,
  // or close to expiration.
  if (storedToken && isTokenValid(storedToken)) {
    return storedToken.access_token;
  }

  const newToken = await requestNewShopifyToken();
  const savedToken = await saveShopifyToken(newToken);

  return savedToken.access_token;
}
