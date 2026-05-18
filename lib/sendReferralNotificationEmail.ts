import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

type SendReferralNotificationEmailParams = {
  toEmail: string;
  partnerName: string;
  locationName: string;
  referralId: string;
  referralUrl: string;
  qrCodeUrl: string;
  rackCardUrl: string;
};

const region = process.env.AWS_REGION || "us-east-2";
const sesClient = new SESClient({ region });

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

  const escapedPartnerName = escapeHtml(partnerName);
  const escapedLocationName = escapeHtml(locationName);
  const escapedReferralId = escapeHtml(referralId);
  const escapedReferralUrl = escapeHtml(referralUrl);
  const escapedQrCodeUrl = escapeHtml(qrCodeUrl);
  const escapedRackCardUrl = escapeHtml(rackCardUrl);

  const textBody = [
    `Hi ${partnerName},`,
    "",
    `We’re excited to welcome ${locationName} to the Alerta Home Referral Program!`,
    "",
    "Your referral resources are now ready. You can use the referral link and rack card below to share Alerta Home with families, caregivers, and care professionals who may benefit from our support.",
    "",
    `Facility / Organization Name: ${locationName}`,
    `Referral ID: ${referralId}`,
    `Referral URL: ${referralUrl}`,
    `QR Code Download: ${qrCodeUrl}`,
    `Rack Card PDF Download: ${rackCardUrl}`,
    "",
    "If you have any questions, please feel free to contact us anytime at care@alertahome.com.",
    "",
    "Thank you again for joining the Alerta Home Referral Program. We truly appreciate your support.",
    "",
    "Best regards,",
    "The Alerta Home Team",
  ].join("\n");

  const htmlBody = [
    `<p>Hi ${escapedPartnerName},</p>`,
    `<p>We’re excited to welcome <strong>${escapedLocationName}</strong> to the Alerta Home Referral Program!</p>`,
    "<p>Your referral resources are now ready. You can use the referral link and rack card below to share Alerta Home with families, caregivers, and care professionals who may benefit from our support.</p>",
    "<ul>",
    `<li><strong>Referral ID:</strong> ${escapedReferralId}</li>`,
    `<li><strong>Referral URL:</strong> <a href="${escapedReferralUrl}">${escapedReferralUrl}</a></li>`,
    `<li>📥 <strong>QR Code:</strong> <a href="${escapedQrCodeUrl}">Download</a></li>`,
    `<li>📄 <strong>Rack Card PDF:</strong> <a href="${escapedRackCardUrl}">Download</a></li>`,
    "</ul>",
    `<p>If you have any questions, please feel free to contact us anytime at <a href="mailto:care@alertahome.com">care@alertahome.com</a>.</p>`,
    "<p>Thank you again for joining the Alerta Home Referral Program. We truly appreciate your support.</p>",
    "<p>Best regards,<br>The Alerta Home Team</p>",
  ].join("");

  await sesClient.send(
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
  );
}
