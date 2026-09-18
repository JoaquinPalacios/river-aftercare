import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  enquirySubject,
  sanitizeHeaderValue,
  type ContactEnquiry,
} from "@/lib/marketing/contact-enquiry";

export interface MarketingContactMessage {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function composeMarketingContactMessage({
  enquiry,
  toEmail,
  fromEmail,
}: {
  enquiry: ContactEnquiry;
  toEmail: string;
  fromEmail: string;
}): MarketingContactMessage {
  const fullName = sanitizeHeaderValue(enquiry.fullName);
  const email = sanitizeHeaderValue(enquiry.workEmail);
  const clinicName = sanitizeHeaderValue(enquiry.clinicName);
  const phone = enquiry.phone ? sanitizeHeaderValue(enquiry.phone) : null;
  const message = enquiry.message?.trim() || null;

  const lines = [
    `${PRODUCT_NAME} enquiry`,
    "",
    `Name: ${fullName}`,
    `Email: ${email}`,
    `Practice: ${clinicName}`,
  ];

  if (phone) {
    lines.push(`Phone: ${phone}`);
  }

  if (message) {
    lines.push("", "Message:", message);
  }

  const htmlRows = [
    ["Name", fullName],
    ["Email", email],
    ["Practice", clinicName],
  ];

  if (phone) {
    htmlRows.push(["Phone", phone]);
  }

  const html = [
    `<p>${escapeHtml(PRODUCT_NAME)} enquiry</p>`,
    "<table>",
    ...htmlRows.map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    ),
    "</table>",
    message
      ? `<p><strong>Message</strong></p><p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    to: toEmail,
    from: fromEmail,
    replyTo: email,
    subject: enquirySubject(clinicName),
    text: lines.join("\n"),
    html,
  };
}
