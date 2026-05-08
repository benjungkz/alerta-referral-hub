import { randomUUID } from "crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "@/lib/dynamodb";
import { ReferralLink } from "@/types/db";

const TABLE_NAME =
  process.env.DYNAMODB_REFERRAL_LINKS_TABLE || "referral_links";

export async function createReferralLink(
  referralLinkData: Partial<ReferralLink> = {},
) {
  if (!referralLinkData.partner_id) {
    throw new Error("partner_id is required to create a referral link.");
  }

  const now = new Date().toISOString();

  const referralLink: ReferralLink = {
    referral_link_id: referralLinkData.referral_link_id || randomUUID(),
    partner_id: referralLinkData.partner_id,
    link_name:
      referralLinkData.link_name ||
      `${referralLinkData.partner_id} referral link`,
    base_path: referralLinkData.base_path || `/${referralLinkData.partner_id}`,
    full_url:
      referralLinkData.full_url ||
      `${process.env.BASE_URL || "http://localhost:3000"}/${referralLinkData.partner_id}`,
    segment_code: referralLinkData.segment_code || "share-awareness",
    utm: referralLinkData.utm || {
      source: "referral",
      medium: "qr",
      campaign: referralLinkData.segment_code || "share-awareness",
      content: "rack_card",
      term: "family_caregiver",
    },
    is_active:
      referralLinkData.is_active !== undefined
        ? referralLinkData.is_active
        : true,
    notes: referralLinkData.notes || "Local referral link test",
    created_at: now,
    updated_at: now,
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: referralLink,
      ConditionExpression: "attribute_not_exists(referral_link_id)",
    }),
  );

  return referralLink;
}
