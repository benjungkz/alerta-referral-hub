import {
  GraphQLClient,
  type RequestDocument,
  type RequestOptions,
  type Variables,
} from "graphql-request";
import { getShopifyAccessToken } from "@/lib/shopify/shopifyToken";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

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

function getShopifyGraphqlUrl() {
  return `https://${getShopifyStoreDomain()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

function mergeShopifyHeaders(requestHeaders?: HeadersInit) {
  const headers = new Headers(requestHeaders);

  headers.set("Content-Type", headers.get("Content-Type") || "application/json");

  return headers;
}

async function createShopifyGraphqlClient(requestHeaders?: HeadersInit) {
  const headers = mergeShopifyHeaders(requestHeaders);

  headers.set("X-Shopify-Access-Token", await getShopifyAccessToken());

  return new GraphQLClient(getShopifyGraphqlUrl(), {
    headers,
  });
}

function isRequestOptions<T, V extends Variables>(
  value: RequestDocument | RequestOptions<V, T>,
): value is RequestOptions<V, T> {
  return typeof value === "object" && value !== null && "document" in value;
}

class ShopifyGraphqlClient {
  async request<T = unknown, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit,
  ): Promise<T>;

  async request<T = unknown, V extends Variables = Variables>(
    options: RequestOptions<V, T>,
  ): Promise<T>;

  async request<T = unknown, V extends Variables = Variables>(
    documentOrOptions: RequestDocument | RequestOptions<V, T>,
    variables?: V,
    requestHeaders?: HeadersInit,
  ) {
    if (isRequestOptions(documentOrOptions)) {
      const client = await createShopifyGraphqlClient(
        documentOrOptions.requestHeaders,
      );

      return client.request<T, V>(documentOrOptions);
    }

    const client = await createShopifyGraphqlClient(requestHeaders);
    const options = {
      document: documentOrOptions as RequestDocument,
      ...(variables === undefined ? {} : { variables }),
    } as RequestOptions<V, T>;

    return client.request<T, V>(options);
  }
}

export const shopifyClient = new ShopifyGraphqlClient();
