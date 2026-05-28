import { shopifyAdminFetch } from "@/lib/shopify/shopifyAdminRestClient";

export const dynamic = "force-dynamic";

type ShopifyShopResponse = {
  shop: unknown;
};

export async function GET() {
  try {
    const data = await shopifyAdminFetch<ShopifyShopResponse>(
      "/admin/api/2026-01/shop.json",
    );

    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch Shopify shop info:", error);

    return Response.json(
      { error: "Failed to fetch Shopify shop info." },
      { status: 500 },
    );
  }
}
