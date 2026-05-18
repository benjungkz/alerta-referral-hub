import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { randomUUID } from "crypto";

type SendReferralNotificationEmailParams = {
  toEmail: string;
  partnerName: string;
  referralId: string;
  referralUrl: string;
  qrCodeUrl: string;
  rackCardUrl: string;
};

const region = process.env.AWS_REGION || "us-east-2";
const sesClient = new SESClient({ region });

function chunkBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchAttachment(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download rack card image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { contentType, buffer };
}

function getAttachmentExtension(contentType: string) {
  if (contentType.includes("pdf")) {
    return "pdf";
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }

  return "png";
}

export async function sendReferralNotificationEmail({
  toEmail,
  partnerName,
  referralId,
  referralUrl,
  qrCodeUrl,
  rackCardUrl,
}: SendReferralNotificationEmailParams) {
  const fromEmail =
    process.env.SES_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error("Missing SES_FROM_EMAIL environment variable.");
  }

  const { contentType, buffer } = await fetchAttachment(rackCardUrl);
  const boundary = `Boundary-${randomUUID()}`;
  const attachmentName = `rack-card-${sanitizeFilenamePart(
    referralId,
  )}.${getAttachmentExtension(contentType)}`;
  const escapedPartnerName = escapeHtml(partnerName);
  const escapedReferralUrl = escapeHtml(referralUrl);
  const escapedQrCodeUrl = escapeHtml(qrCodeUrl);

  const textBody = [
    `Hi ${partnerName},`,
    "",
    "Your Alerta referral resources are ready.",
    "",
    `Referral URL: ${referralUrl}`,
    `QR code URL: ${qrCodeUrl}`,
    "",
    "The rack card image is attached to this email.",
  ].join("\n");

  const htmlBody = [
    `<p>Hi ${escapedPartnerName},</p>`,
    "<p>Your Alerta referral resources are ready.</p>",
    `<p><strong>Referral URL:</strong> <a href="${escapedReferralUrl}">${escapedReferralUrl}</a></p>`,
    `<p><strong>QR code URL:</strong> <a href="${escapedQrCodeUrl}">${escapedQrCodeUrl}</a></p>`,
    "<p>The rack card image is attached to this email.</p>",
  ].join("");

  const rawMessage = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: Your Alerta referral rack card is ready`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: multipart/alternative; boundary="Alternative"',
    "",
    "--Alternative",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(Buffer.from(textBody, "utf8").toString("base64")),
    "",
    "--Alternative",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(Buffer.from(htmlBody, "utf8").toString("base64")),
    "",
    "--Alternative--",
    "",
    `--${boundary}`,
    `Content-Type: ${contentType}; name="${attachmentName}"`,
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(buffer.toString("base64")),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  await sesClient.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage),
      },
    }),
  );
}
