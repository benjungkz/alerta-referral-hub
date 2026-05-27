import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { getAwsClientConfig } from "./awsConfig";
import { getEnvTimeoutMs, withTimeout } from "./timeout";

type SendReferralNotificationEmailParams = {
  toEmail: string;
  partnerName: string;
  locationName: string;
  referralId: string;
  referralUrl: string;
  qrCodeUrl: string;
  rackCardUrl: string;
};

const sesClient = new SESClient(getAwsClientConfig());

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendReferralNotificationEmail({
  toEmail,
  partnerName,
  locationName,
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

  const normalizedLocationName = locationName.trim();
  const hasLocationName = normalizedLocationName.length > 0;
  const escapedPartnerName = escapeHtml(partnerName);
  const escapedLocationName = escapeHtml(normalizedLocationName);
  const escapedReferralId = escapeHtml(referralId);
  const escapedReferralUrl = escapeHtml(referralUrl);
  const escapedQrCodeUrl = escapeHtml(qrCodeUrl);
  const escapedRackCardUrl = escapeHtml(rackCardUrl);

  const textBody = [
    `Hi ${partnerName},`,
    "",
    hasLocationName
      ? `We are excited to welcome ${normalizedLocationName} to the Alerta Home Referral Program!`
      : "We are excited to welcome you to the Alerta Home Referral Program!",
    "",
    "Your referral resources are now ready. You can use the referral link and rack card below to share Alerta Home with families, caregivers, and care professionals who may benefit from our support.",
    "",
    ...(hasLocationName
      ? [`Facility / Organization Name: ${normalizedLocationName}`]
      : []),
    `Referral ID: ${referralId}`,
    `Referral URL: ${referralUrl}`,
    `QR Code Download: ${qrCodeUrl}`,
    `Rack Card PDF Download: ${rackCardUrl}`,
    "",
    "If you have any questions, please feel free to contact us anytime at sales@alertahome.com.",
    "",
    "Thank you again for joining the Alerta Home Referral Program. We truly appreciate your support.",
    "",
    "Best regards,",
    "The Alerta Home Team",
  ].join("\n");

  const htmlBody = [
    `<p>Hi ${escapedPartnerName},</p>`,
    hasLocationName
      ? `<p>We are excited to welcome <strong>${escapedLocationName}</strong> to the Alerta Home Referral Program!</p>`
      : "<p>We are excited to welcome you to the Alerta Home Referral Program!</p>",
    "<p>Your referral resources are now ready. You can use the referral link and rack card below to share Alerta Home with families, caregivers, and care professionals who may benefit from our support.</p>",
    "<ul>",
    ...(hasLocationName
      ? [
          `<li><strong>Facility / Organization Name:</strong> ${escapedLocationName}</li>`,
        ]
      : []),
    `<li><strong>Referral ID:</strong> ${escapedReferralId}</li>`,
    `<li><strong>Referral URL:</strong> <a href="${escapedReferralUrl}">${escapedReferralUrl}</a></li>`,
    `<li><strong>QR Code:</strong> <a href="${escapedQrCodeUrl}">Download</a></li>`,
    `<li><strong>Rack Card PDF:</strong> <a href="${escapedRackCardUrl}">Download</a></li>`,
    "</ul>",
    `<p>If you have any questions, please feel free to contact us anytime at <a href="mailto:sales@alertahome.com">sales@alertahome.com</a>.</p>`,
    "<p>Thank you again for joining the Alerta Home Referral Program. We truly appreciate your support.</p>",
    "<p>Best regards,<br>The Alerta Home Team</p>",
  ].join("");

  await withTimeout(
    sesClient.send(
      new SendEmailCommand({
        Destination: {
          ToAddresses: [toEmail],
        },
        Message: {
          Subject: {
            Charset: "UTF-8",
            Data: "Your Alerta Home Referral Resources Are Ready",
          },
          Body: {
            Text: {
              Charset: "UTF-8",
              Data: textBody,
            },
            Html: {
              Charset: "UTF-8",
              Data: htmlBody,
            },
          },
        },
        Source: fromEmail,
      }),
    ),
    getEnvTimeoutMs("SES_SEND_TIMEOUT_MS", 15_000),
    "Timed out sending referral notification email.",
  );
}
