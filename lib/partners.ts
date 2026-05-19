import { randomUUID } from "crypto";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "./dynamodb";
import { logger } from "./logger";
import { getReferralUrl } from "./urlConfig";
import {
  EmailStatus,
  Partner,
  PartnerLocation,
  ReferralLink,
  ResourceGenerationStatus,
} from "../types/db";
const REFERRAL_LINKS_TABLE_NAME =
  process.env.DYNAMODB_REFERRAL_LINKS_TABLE || "referral_links";
const REFERRAL_LINKS_PARTNER_ID_INDEX =
  process.env.DYNAMODB_REFERRAL_LINKS_PARTNER_ID_INDEX || "partner_id-GSI";
const PARTNER_LOCATIONS_TABLE_NAME =
  process.env.DYNAMODB_PARTNER_LOCATIONS_TABLE || "partner_locations";

const TABLE_NAME = process.env.DYNAMODB_PARTNERS_TABLE || "partners";

export function obfuscateEmail(email: string): string {
  const [localPart, domain] = email.split("@");

  if (!domain) {
    return email;
  }

  const obfuscatedLocal =
    localPart.length <= 2
      ? localPart
      : `${localPart[0]}${"*".repeat(Math.max(1, localPart.length - 2))}${localPart.slice(-1)}`;

  const [domainName, ...domainParts] = domain.split(".");
  const obfuscatedDomainName =
    domainName.length <= 2
      ? domainName
      : `${domainName[0]}${"*".repeat(Math.max(1, domainName.length - 2))}${domainName.slice(-1)}`;

  return `${obfuscatedLocal}@${[obfuscatedDomainName, ...domainParts].join(".")}`;
}

export async function isEmailExists(email: string): Promise<boolean> {
  const result = await ddbDocClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "contact_email = :email",
      ExpressionAttributeValues: {
        ":email": email,
      },
      ProjectionExpression: "partner_id",
      Limit: 1,
    }),
  );

  return (result.Items?.length ?? 0) > 0;
}

export async function createPartner(partnerData: Partial<Partner> = {}) {
  //Validation not null checks for required fields
  if (!partnerData.partner_id) {
    logger.error({
      event: "CREATE_PARTNER_VALIDATION_FAILED",
      message: "Missing required partner_id",
      metadata: {
        field: "partner_id",
      },
    });

    throw new Error(
      "partner_id is required. the data submitted is missing this field.",
    );
  }

  if (!partnerData.partner_first_name) {
    logger.error({
      event: "CREATE_PARTNER_VALIDATION_FAILED",
      message: "Missing required partner_first_name",
      metadata: {
        field: "partner_first_name",
      },
    });

    throw new Error(
      "partner_first_name is required. the data submitted is missing this field.",
    );
  }

  if (!partnerData.partner_last_name) {
    logger.error({
      event: "CREATE_PARTNER_VALIDATION_FAILED",
      message: "Missing required partner_last_name",
      metadata: {
        field: "partner_last_name",
      },
    });

    throw new Error(
      "partner_last_name is required. the data submitted is missing this field.",
    );
  }

  if (!partnerData.contact_phone || partnerData.contact_phone.trim() === "") {
    logger.error({
      event: "CREATE_PARTNER_VALIDATION_FAILED",
      message: "Missing required contact_phone",
      metadata: {
        field: "contact_phone",
      },
    });

    throw new Error(
      "contact_phone is required. the data submitted is missing this field.",
    );
  }

  //Email duplicate check would be ideal here, but for simplicity, we'll skip it in this example.
  const contactEmail = partnerData.contact_email!;
  const emailExists = await isEmailExists(contactEmail);

  if (emailExists) {
    logger.warn({
      event: "CREATE_PARTNER_DUPLICATE_EMAIL",
      message: "Partner email duplicate detected",
      partner_id: partnerData.partner_id,
      field: "contact_email",
      metadata: {
        email: obfuscateEmail(contactEmail),
      },
    });
    throw new Error(
      `Partner(${partnerData.partner_id}) with email address already exists`,
    );
  }

  // set data from input or use defaults for missing fields
  const now = new Date().toISOString();

  const partner: Partner = {
    partner_id: partnerData.partner_id!,
    partner_first_name: partnerData.partner_first_name!,
    partner_last_name: partnerData.partner_last_name!,
    organization_name: partnerData.organization_name,
    contact_name:
      partnerData.contact_name ||
      `${partnerData.partner_first_name!} ${partnerData.partner_last_name!}`,
    contact_email: partnerData.contact_email!,
    contact_phone: partnerData.contact_phone!,
    segment_code: partnerData.segment_code || "share-awareness",
    reporting_group: partnerData.reporting_group || "marketing",
    status: partnerData.status || "pending",
    notes: partnerData.notes || "",
    consent: partnerData.consent!,
    resource_generation_status:
      partnerData.resource_generation_status || "pending",
    email_status: partnerData.email_status || "pending",
    created_at: now,
    updated_at: now,
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: partner,
      ConditionExpression: "attribute_not_exists(partner_id)",
    }),
  );

  return partner;
}

export async function createPartnerWithReferralLink(
  partnerData: Partial<Partner> = {},
  referralLinkData: Partial<ReferralLink> = {},
  partnerLocationData: Partial<PartnerLocation> = {},
) {
  // Validation not null checks for required fields for both partner and referral link creation in a single transaction
  if (!partnerData.partner_id) {
    throw new Error(
      "partner_id is required for transactional partner creation.",
    );
  }

  if (!partnerData.partner_first_name) {
    throw new Error(
      "partner_first_name is required for transactional partner creation.",
    );
  }

  if (!partnerData.partner_last_name) {
    throw new Error(
      "partner_last_name is required for transactional partner creation.",
    );
  }

  if (!partnerData.contact_email) {
    throw new Error(
      "contact_email is required for transactional partner creation.",
    );
  }

  if (!partnerData.contact_phone || partnerData.contact_phone.trim() === "") {
    throw new Error(
      "contact_phone is required for transactional partner creation.",
    );
  }

  if (!partnerData.consent) {
    throw new Error("consent is required for transactional partner creation.");
  }

  if (!referralLinkData.partner_id) {
    throw new Error(
      "partner_id is required for transactional referral link creation.",
    );
  }

  // payload preparation for both partner and referral link with defaults for missing optional fields
  const now = new Date().toISOString();

  const partner: Partner = {
    partner_id: partnerData.partner_id!,
    partner_first_name: partnerData.partner_first_name!,
    partner_last_name: partnerData.partner_last_name!,
    organization_name: partnerData.organization_name || "",
    contact_name:
      partnerData.contact_name ||
      `${partnerData.partner_first_name!} ${partnerData.partner_last_name!}`,
    contact_email: partnerData.contact_email!,
    contact_phone: partnerData.contact_phone!,
    segment_code: partnerData.segment_code || "share-awareness",
    reporting_group: partnerData.reporting_group || "marketing",
    status: partnerData.status || "pending",
    consent: partnerData.consent!,
    notes: partnerData.notes || "",
    resource_generation_status:
      partnerData.resource_generation_status || "pending",
    email_status: partnerData.email_status || "pending",
    created_at: partnerData.created_at!,
    updated_at: now,
  };

  const referralLink: ReferralLink = {
    referral_link_id: referralLinkData.referral_link_id || randomUUID(),
    partner_id: partner.partner_id,
    link_name:
      referralLinkData.link_name ||
      `${partner.partner_first_name} ${partner.partner_last_name}`,
    base_path: referralLinkData.base_path || `/${partner.partner_id}`,
    full_url:
      referralLinkData.full_url ||
      getReferralUrl(partner.partner_id),
    segment_code: referralLinkData.segment_code || partner.segment_code,
    utm: referralLinkData.utm || {
      source: "referral",
      medium: "qr",
      campaign: referralLinkData.segment_code || partner.segment_code,
      content: "rack_card",
      term: "family_caregiver",
    },
    is_active:
      referralLinkData.is_active !== undefined
        ? referralLinkData.is_active
        : true,
    notes: referralLinkData.notes || partner.notes || "",
    created_at: now,
    updated_at: now,
  };

  const partnerLocation = partnerLocationData.location_name
    ? ({
        location_id: partnerLocationData.location_id || randomUUID(),
        partner_id: partner.partner_id,
        location_name: partnerLocationData.location_name,
        status: partnerLocationData.status || "active",
        created_at: now,
        updated_at: now,
      } satisfies PartnerLocation)
    : undefined;

  //DB transaction to create both partner and referral link atomically
  await ddbDocClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: partner,
            ConditionExpression: "attribute_not_exists(partner_id)",
          },
        },
        {
          Put: {
            TableName:
              process.env.DYNAMODB_REFERRAL_LINKS_TABLE || "referral_links",
            Item: referralLink,
            ConditionExpression: "attribute_not_exists(referral_link_id)",
          },
        },
        ...(partnerLocation
          ? [
              {
                Put: {
                  TableName: PARTNER_LOCATIONS_TABLE_NAME,
                  Item: partnerLocation,
                  ConditionExpression: "attribute_not_exists(location_id)",
                },
              },
            ]
          : []),
      ],
    }),
  );

  return { partner, referralLink, partnerLocation };
}

export async function getPartner(partnerId = "JUNG-A9K3") {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        partner_id: partnerId,
      },
    }),
  );

  return result.Item;
}

export async function updatePartnerStatus(
  partnerId = "JUNG-A9K3",
  status: string = "active",
  updatedAt: string = new Date().toISOString(),
) {
  const result = await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        partner_id: partnerId,
      },
      UpdateExpression: "SET #status = :status, updated_at = :updated_at",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":updated_at": updatedAt,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return result.Attributes;
}

export async function deletePartner(partnerId = "JUNG-A9K3") {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        partner_id: partnerId,
      },
    }),
  );

  return { partner_id: partnerId, deleted: true };
}

export async function updatePartnerProcessingStatus(
  partnerId: string,
  updates: {
    resource_generation_status?: ResourceGenerationStatus;
    email_status?: EmailStatus;
  },
  updatedAt: string = new Date().toISOString(),
) {
  const setExpressions = ["updated_at = :updated_at"];
  const expressionAttributeValues: Record<string, unknown> = {
    ":updated_at": updatedAt,
  };

  if (updates.resource_generation_status) {
    setExpressions.push(
      "resource_generation_status = :resource_generation_status",
    );
    expressionAttributeValues[":resource_generation_status"] =
      updates.resource_generation_status;
  }

  if (updates.email_status) {
    setExpressions.push("email_status = :email_status");
    expressionAttributeValues[":email_status"] = updates.email_status;
  }

  if (setExpressions.length === 1) {
    return undefined;
  }

  const result = await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        partner_id: partnerId,
      },
      UpdateExpression: `SET ${setExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    }),
  );

  return result.Attributes;
}

export async function updateReferralResourcesAtomic(
  partnerId: string,
  status: string,
  qrCodeAssetUrl: string,
  rackCardUrl: string,
  updatedAt: string = new Date().toISOString(),
) {
  // 1. Find all referral links for this partner
  const referralLinksResult = await ddbDocClient.send(
    new QueryCommand({
      TableName: REFERRAL_LINKS_TABLE_NAME,
      IndexName: REFERRAL_LINKS_PARTNER_ID_INDEX,
      KeyConditionExpression: "partner_id = :partner_id",
      ExpressionAttributeValues: {
        ":partner_id": partnerId,
      },
      ProjectionExpression: "referral_link_id",
    }),
  );

  const referralLinkIds = (referralLinksResult.Items || []).map(
    (item) => item.referral_link_id as string,
  );

  if (referralLinkIds.length === 0) {
    throw new Error(`No referral link found for partner_id=${partnerId}`);
  }

  // 2. Build TransactWrite items: update partner + all referral links atomically
  const transactItems = [
    {
      Update: {
        TableName: TABLE_NAME,
        Key: { partner_id: partnerId },
        UpdateExpression:
          "SET #status = :status, qr_code_asset_url = :qr_code_asset_url, rack_card_url = :rack_card_url, resource_generation_status = :resource_generation_status, updated_at = :updated_at",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": status,
          ":qr_code_asset_url": qrCodeAssetUrl,
          ":rack_card_url": rackCardUrl,
          ":resource_generation_status": "completed",
          ":updated_at": updatedAt,
        },
      },
    },
    ...referralLinkIds.map((referralLinkId) => ({
      Update: {
        TableName: REFERRAL_LINKS_TABLE_NAME,
        Key: { referral_link_id: referralLinkId },
        UpdateExpression:
          "SET qr_code_asset_url = :qr_code_asset_url, rack_card_url = :rack_card_url, updated_at = :updated_at",
        ExpressionAttributeValues: {
          ":qr_code_asset_url": qrCodeAssetUrl,
          ":rack_card_url": rackCardUrl,
          ":updated_at": updatedAt,
        },
      },
    })),
  ];

  // 3. Execute atomic transaction
  const result = await ddbDocClient.send(
    new TransactWriteCommand({ TransactItems: transactItems }),
  );

  return result;
}
