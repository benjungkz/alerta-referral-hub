import { getShopifyAccessToken } from "@/lib/shopify/shopifyToken";

type ShopifyErrorResponse = {
  errors?: unknown;
  error?: unknown;
  message?: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function getShopifyStoreDomain() {
  return getRequiredEnv("SHOPIFY_STORE_DOMAIN")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function buildShopifyAdminUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `https://${getShopifyStoreDomain()}${normalizedPath}`;
}

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getShopifyErrorMessage(body: unknown) {
  if (typeof body === "string") {
    return body.slice(0, 500);
  }

  if (body && typeof body === "object") {
    const errorBody = body as ShopifyErrorResponse;
    const errorDetails =
      errorBody.errors ?? errorBody.error ?? errorBody.message;

    if (typeof errorDetails === "string") {
      return errorDetails;
    }

    if (errorDetails !== undefined) {
      return JSON.stringify(errorDetails).slice(0, 500);
    }
  }

  return "No error details returned.";
}

export async function shopifyAdminFetch<TResponse = unknown>(
  path: string,
  init: RequestInit = {},
) {
  const accessToken = await getShopifyAccessToken();
  const headers = new Headers(init.headers);

  headers.set("X-Shopify-Access-Token", accessToken);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildShopifyAdminUrl(path), {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Shopify Admin API request failed with status ${response.status}: ${getShopifyErrorMessage(
        body,
      )}`,
    );
  }

  return body as TResponse;
}
