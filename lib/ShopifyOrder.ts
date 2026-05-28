import { gql } from "graphql-request";
import { shopifyClient } from "./ShopifyClient";
import { getEnvTimeoutMs, withTimeout } from "./timeout";

type TagsAddResponse = {
  tagsAdd: {
    userErrors: Array<{
      field?: string[];
      message: string;
    }>;
  };
};

/**
 * Adds tags to a Shopify order
 */
export async function addTagsToOrder(orderGid: string, tags: string[]) {
  const mutation = gql`
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await withTimeout(
    shopifyClient.request<TagsAddResponse>(mutation, {
      id: orderGid,
      tags,
    }),
    getEnvTimeoutMs("SHOPIFY_TAG_TIMEOUT_MS", 15_000),
    "Timed out adding Shopify tags to order.",
  );

  if (data.tagsAdd.userErrors.length > 0) {
    console.error("Shopify tag error:", data.tagsAdd.userErrors);
    throw new Error("Failed to add tags to order");
  }

  return data;
}
