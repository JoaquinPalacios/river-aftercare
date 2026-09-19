import { EMAIL_PATTERN } from "@/lib/email/mailbox";
import {
  DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  SITE_NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/seo/defaults";
import {
  MARKETING_SEO_PATHS,
  type MarketingPageSeoInput,
  type MarketingSeoPath,
  type PlatformSeoIdentity,
} from "@/lib/seo/types";

const HTML_PATTERN = /<[^>]*>/;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const DISALLOWED_PROTOCOL_PATTERN = /^(javascript|data|vbscript):/i;
const SAME_ORIGIN_IMAGE_PATTERN =
  /^\/(?!\/)[A-Za-z0-9._\-/]+\.(?:png|jpe?g|webp|svg|gif)$/i;

export interface SeoValidationIssue {
  field: string;
  message: string;
}

export interface ValidatedPlatformSeoInput {
  identity: Omit<PlatformSeoIdentity, "updatedAt">;
  pages: MarketingPageSeoInput[];
}

function rejectUnsafeText(field: string, value: string): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];
  if (HTML_PATTERN.test(value)) {
    issues.push({ field, message: "HTML is not allowed." });
  }
  if (CONTROL_PATTERN.test(value)) {
    issues.push({ field, message: "Control characters are not allowed." });
  }
  if (/<script/i.test(value) || DISALLOWED_PROTOCOL_PATTERN.test(value)) {
    issues.push({
      field,
      message: "Scripts and embedded protocols are not allowed.",
    });
  }
  return issues;
}

function requiredText(
  field: string,
  value: string,
  max: number
): { value: string; issues: SeoValidationIssue[] } {
  const trimmed = value.trim();
  const issues = rejectUnsafeText(field, trimmed);
  if (!trimmed) {
    issues.push({ field, message: "This field is required." });
  } else if (trimmed.length > max) {
    issues.push({
      field,
      message: `Keep this under ${max} characters.`,
    });
  }
  return { value: trimmed, issues };
}

function optionalText(
  field: string,
  value: string | null | undefined,
  max: number
): { value: string | null; issues: SeoValidationIssue[] } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { value: null, issues: [] };
  }
  const issues = rejectUnsafeText(field, trimmed);
  if (trimmed.length > max) {
    issues.push({
      field,
      message: `Keep this under ${max} characters.`,
    });
  }
  return { value: trimmed, issues };
}

export function validatePublicEmail(
  field: string,
  value: string | null | undefined
): { value: string | null; issues: SeoValidationIssue[] } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { value: null, issues: [] };
  }
  const issues = rejectUnsafeText(field, trimmed);
  if (!EMAIL_PATTERN.test(trimmed) || /[\r\n]/.test(trimmed)) {
    issues.push({ field, message: "Enter a valid public email address." });
  }
  return { value: trimmed, issues };
}

export function validateHttpUrl(
  field: string,
  value: string
): { value: string | null; issues: SeoValidationIssue[] } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, issues: [] };
  }
  const issues = rejectUnsafeText(field, trimmed);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      issues.push({ field, message: "Use an http or https URL." });
    } else if (DISALLOWED_PROTOCOL_PATTERN.test(parsed.protocol)) {
      issues.push({ field, message: "That URL protocol is not allowed." });
    } else if (parsed.username || parsed.password) {
      issues.push({ field, message: "URLs cannot include credentials." });
    }
    return { value: parsed.toString(), issues };
  } catch {
    issues.push({ field, message: "Enter a valid URL." });
    return { value: trimmed, issues };
  }
}

export function validateSameOriginImagePath(
  field: string,
  value: string | null | undefined
): { value: string | null; issues: SeoValidationIssue[] } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { value: null, issues: [] };
  }
  const issues = rejectUnsafeText(field, trimmed);
  if (
    trimmed.includes("..") ||
    !SAME_ORIGIN_IMAGE_PATTERN.test(trimmed) ||
    DISALLOWED_PROTOCOL_PATTERN.test(trimmed)
  ) {
    issues.push({
      field,
      message: "Use a same-origin image path such as /brand/share.png.",
    });
  }
  return { value: trimmed, issues };
}

export function parseSameAsUrls(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isMarketingSeoPath(value: string): value is MarketingSeoPath {
  return (MARKETING_SEO_PATHS as readonly string[]).includes(value);
}

export function validatePlatformSeoInput(input: {
  siteName: string;
  defaultDescription: string;
  organizationName: string;
  organizationDescription: string;
  publicContactEmail: string | null;
  defaultOgImagePath: string | null;
  sameAsUrls: string[];
  pages: Array<{
    path: string;
    seoTitle: string;
    metaDescription: string;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImagePath: string | null;
    index: boolean;
    follow: boolean;
  }>;
}): { value?: ValidatedPlatformSeoInput; issues: SeoValidationIssue[] } {
  const issues: SeoValidationIssue[] = [];
  const siteName = requiredText(
    "siteName",
    input.siteName,
    SITE_NAME_MAX_LENGTH
  );
  const defaultDescription = requiredText(
    "defaultDescription",
    input.defaultDescription,
    DESCRIPTION_MAX_LENGTH
  );
  const organizationName = requiredText(
    "organizationName",
    input.organizationName,
    SITE_NAME_MAX_LENGTH
  );
  const organizationDescription = requiredText(
    "organizationDescription",
    input.organizationDescription,
    ORGANIZATION_DESCRIPTION_MAX_LENGTH
  );
  const publicContactEmail = validatePublicEmail(
    "publicContactEmail",
    input.publicContactEmail
  );
  const defaultOgImagePath = validateSameOriginImagePath(
    "defaultOgImagePath",
    input.defaultOgImagePath
  );
  issues.push(
    ...siteName.issues,
    ...defaultDescription.issues,
    ...organizationName.issues,
    ...organizationDescription.issues,
    ...publicContactEmail.issues,
    ...defaultOgImagePath.issues
  );

  const sameAsUrls: string[] = [];
  const uniqueUrls = new Set<string>();
  if (input.sameAsUrls.length > 8) {
    issues.push({
      field: "sameAsUrls",
      message: "Add at most eight entity or social URLs.",
    });
  }
  input.sameAsUrls.forEach((url, index) => {
    const parsed = validateHttpUrl(`sameAsUrls.${index}`, url);
    issues.push(...parsed.issues);
    if (parsed.value && parsed.issues.length === 0) {
      if (uniqueUrls.has(parsed.value)) {
        return;
      }
      uniqueUrls.add(parsed.value);
      sameAsUrls.push(parsed.value);
    }
  });

  const pages: MarketingPageSeoInput[] = [];
  const seenPaths = new Set<string>();
  for (const page of input.pages) {
    if (!isMarketingSeoPath(page.path)) {
      issues.push({
        field: `pages.${page.path}`,
        message: "That marketing path is not editable.",
      });
      continue;
    }
    if (seenPaths.has(page.path)) {
      issues.push({
        field: `pages.${page.path}`,
        message: "Duplicate marketing path.",
      });
      continue;
    }
    seenPaths.add(page.path);
    const seoTitle = requiredText(
      `pages.${page.path}.seoTitle`,
      page.seoTitle,
      TITLE_MAX_LENGTH
    );
    const metaDescription = requiredText(
      `pages.${page.path}.metaDescription`,
      page.metaDescription,
      DESCRIPTION_MAX_LENGTH
    );
    const ogTitle = optionalText(
      `pages.${page.path}.ogTitle`,
      page.ogTitle,
      TITLE_MAX_LENGTH
    );
    const ogDescription = optionalText(
      `pages.${page.path}.ogDescription`,
      page.ogDescription,
      DESCRIPTION_MAX_LENGTH
    );
    const ogImagePath = validateSameOriginImagePath(
      `pages.${page.path}.ogImagePath`,
      page.ogImagePath
    );
    issues.push(
      ...seoTitle.issues,
      ...metaDescription.issues,
      ...ogTitle.issues,
      ...ogDescription.issues,
      ...ogImagePath.issues
    );
    pages.push({
      path: page.path,
      seoTitle: seoTitle.value,
      metaDescription: metaDescription.value,
      ogTitle: ogTitle.value,
      ogDescription: ogDescription.value,
      ogImagePath: ogImagePath.value,
      index: page.index,
      follow: page.follow,
      updatedAt: null,
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    issues,
    value: {
      identity: {
        siteName: siteName.value,
        defaultDescription: defaultDescription.value,
        organizationName: organizationName.value,
        organizationDescription: organizationDescription.value,
        publicContactEmail: publicContactEmail.value,
        defaultOgImagePath: defaultOgImagePath.value,
        sameAsUrls,
      },
      pages,
    },
  };
}
