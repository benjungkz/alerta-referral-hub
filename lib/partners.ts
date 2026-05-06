import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "./dynamodb";
import { logger } from "./logger";
import { Partner } from "../types/db";

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

  console.log(result);

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

export async function updatePartnerStatus(partnerId = "JUNG-A9K3") {
  const now = new Date().toISOString();

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
        ":status": "active",
        ":updated_at": now,
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
