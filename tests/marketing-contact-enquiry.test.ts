import { describe, expect, it } from "vitest";

import {
  CONTACT_HONEYPOT_FIELD,
  contactEnquirySchema,
  contactFieldErrorsFromZod,
  enquirySubject,
  isHoneypotTriggered,
  readContactFormValues,
  sanitizeHeaderValue,
  validateContactFormValues,
} from "@/lib/marketing/contact-enquiry";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const valid = {
  fullName: "Alex Rivera",
  workEmail: "alex@clinic.example.test",
  clinicName: "Harbour Dental",
  phone: "",
  message: "",
  [CONTACT_HONEYPOT_FIELD]: "",
};

describe("contact enquiry schema", () => {
  it("accepts required clinic fields and optional blanks", () => {
    const parsed = contactEnquirySchema.parse(valid);
    expect(parsed.phone).toBeNull();
    expect(parsed.message).toBeNull();
    expect(parsed.workEmail).toBe("alex@clinic.example.test");
    expect(isHoneypotTriggered(parsed)).toBe(false);
  });

  it("mirrors required-field errors without Zod on the client helper", () => {
    const errors = validateContactFormValues({
      ...valid,
      fullName: "",
      workEmail: "not-an-email",
      clinicName: "",
    });
    expect(errors.fullName).toMatch(/full name/i);
    expect(errors.workEmail).toMatch(/enter a valid email/i);
    expect(errors.clinicName).toMatch(/practice or clinic/i);
    expect(errors).not.toHaveProperty("locationCount");
  });

  it("requires name, email, and clinic", () => {
    const parsed = contactEnquirySchema.safeParse({
      ...valid,
      fullName: "",
      workEmail: "not-an-email",
      clinicName: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    const errors = contactFieldErrorsFromZod(parsed.error);
    expect(errors.fullName).toMatch(/full name/i);
    expect(errors.workEmail).toMatch(/valid email/i);
    expect(errors.clinicName).toMatch(/practice or clinic/i);
    expect(errors).not.toHaveProperty("locationCount");
    expect(JSON.stringify(errors)).not.toMatch(/work email/i);
  });

  it("does not collect patient, clinical, or location-count fields", () => {
    const data = readContactFormValues(formData(valid));
    expect(Object.keys(data)).toEqual([
      "fullName",
      "workEmail",
      "clinicName",
      "phone",
      "message",
      CONTACT_HONEYPOT_FIELD,
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /patient|specialty|password|billing|locationCount/i
    );
  });

  it("detects a filled honeypot", () => {
    const parsed = contactEnquirySchema.parse({
      ...valid,
      [CONTACT_HONEYPOT_FIELD]: "http://spam.test",
    });
    expect(isHoneypotTriggered(parsed)).toBe(true);
  });

  it("sanitises mail headers and builds a clinic subject", () => {
    expect(sanitizeHeaderValue("Harbour\r\nDental")).toBe("Harbour Dental");
    expect(enquirySubject("Harbour\nDental")).toBe(
      "River Aftercare enquiry — Harbour Dental"
    );
    expect(enquirySubject("")).toBe("River Aftercare enquiry");
    expect(enquirySubject("A".repeat(200)).length).toBeLessThanOrEqual(
      "River Aftercare enquiry — ".length + 80
    );
  });

  it("rejects overlong values", () => {
    const parsed = contactEnquirySchema.safeParse({
      ...valid,
      fullName: "A".repeat(121),
      phone: "1".repeat(41),
      message: "M".repeat(2001),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    const errors = contactFieldErrorsFromZod(parsed.error);
    expect(errors.fullName).toMatch(/too long/i);
    expect(errors.phone).toMatch(/too long/i);
    expect(errors.message).toMatch(/too long/i);
  });
});
