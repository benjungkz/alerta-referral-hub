import { gql } from "graphql-request";
import { shopifyClient } from "./ShopifyClient";

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

  const data = await shopifyClient.request(mutation, {
    id: orderGid,
    tags,
  });

  if (data.tagsAdd.userErrors.length > 0) {
    console.error("Shopify tag error:", data.tagsAdd.userErrors);
    throw new Error("Failed to add tags to order");
  }

  return data;
}
