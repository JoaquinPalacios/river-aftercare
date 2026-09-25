import fs from "node:fs";
import path from "node:path";

import { ClinicMembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { forgotPasswordSchema } from "@/app/(staff)/forgot-password/forgot-password-schema";
import { loginSchema } from "@/app/(staff)/login/login-schema";
import {
  acceptInvitationSchema,
  resetPasswordSchema,
} from "@/app/(staff)/account/security/password-form-schema";
import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import {
  LOGIN_EMAIL_INVALID_MESSAGE,
  LOGIN_EMAIL_REQUIRED_MESSAGE,
  LOGIN_EMAIL_TOO_LONG_MESSAGE,
  LOGIN_PASSWORD_REQUIRED_MESSAGE,
  LOGIN_PASSWORD_TOO_LONG_MESSAGE,
  loginClientFieldErrors,
  normalizeLoginEmail,
  staffEmailFieldError,
} from "@/lib/auth/login-input";
import { newPasswordFieldErrors } from "@/lib/auth/password-policy";
import {
  CLINIC_MEMBERSHIP_ROLE,
  CLINIC_MEMBERSHIP_ROLES,
  type ClinicMembershipRoleName,
} from "@/lib/clinic-portal/membership-role";
import { inviteClinicUserFormSchema } from "@/lib/operator/clinic-invitation-input";
import {
  INVITED_NAME_HTML_MESSAGE,
  INVITED_NAME_MAX_LENGTH,
  INVITED_NAME_REQUIRED_MESSAGE,
  INVITED_ROLE_INVALID_MESSAGE,
  invitedNameError,
} from "@/lib/operator/clinic-invitation-fields";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

const clinicRoleNamesMatchPrisma: Equal<
  ClinicMembershipRole,
  ClinicMembershipRoleName
> = true;

const root = path.resolve(import.meta.dirname, "..");
const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

function resolveImport(fromFile: string, spec: string): string | null {
  let relative = spec;
  if (spec.startsWith("@/")) {
    relative = spec.slice(2);
  } else if (spec.startsWith(".")) {
    relative = path.relative(root, path.resolve(path.dirname(fromFile), spec));
  } else {
    return null;
  }

  const base = path.join(root, relative);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => base + extension),
    ...sourceExtensions.map((extension) =>
      path.join(base, `index${extension}`)
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function valueSpecs(source: string): string[] {
  const specs: string[] = [];
  const importPattern =
    /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const typeOnly = Boolean(match[1]);
    const clause = match[2]?.trim() ?? "";
    const spec = match[3];
    if (!spec || typeOnly) {
      continue;
    }
    if (clause.startsWith("{")) {
      const inner = clause.slice(1, clause.lastIndexOf("}"));
      const hasValue = inner.split(",").some((part) => {
        const name = part.trim();
        return name.length > 0 && !name.startsWith("type ");
      });
      if (hasValue) {
        specs.push(spec);
      }
      continue;
    }
    if (clause.length > 0) {
      specs.push(spec);
    }
  }

  for (const match of source.matchAll(/import\s+["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec) {
      specs.push(spec);
    }
  }

  const exportPattern =
    /export\s+(type\s+)?(\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(exportPattern)) {
    const typeOnly = Boolean(match[1]);
    const clause = match[2] ?? "";
    const spec = match[3];
    if (!spec || typeOnly) {
      continue;
    }
    if (clause === "*") {
      specs.push(spec);
      continue;
    }
    const inner = clause.slice(1, clause.lastIndexOf("}"));
    const hasValue = inner.split(",").some((part) => {
      const name = part.trim();
      return name.length > 0 && !name.startsWith("type ");
    });
    if (hasValue) {
      specs.push(spec);
    }
  }

  return specs;
}

function walkSources(directory: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git" ||
      entry.name === "tests" ||
      entry.name === "e2e" ||
      entry.name === "scripts"
    ) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkSources(fullPath, files);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isDirective(source: string, directive: "use client" | "use server") {
  return source
    .split("\n")
    .slice(0, 8)
    .some(
      (line) =>
        line.trim() === `"${directive}";` || line.trim() === `'${directive}';`
    );
}

function clientHeavyImports(): string[] {
  const findings: string[] = [];
  const clients = walkSources(root).filter((file) =>
    isDirective(fs.readFileSync(file, "utf8"), "use client")
  );

  for (const client of clients) {
    const seen = new Set<string>();
    const stack = [client];
    while (stack.length > 0) {
      const file = stack.pop();
      if (!file || seen.has(file)) {
        continue;
      }
      seen.add(file);
      if (
        file !== client &&
        isDirective(fs.readFileSync(file, "utf8"), "use server")
      ) {
        continue;
      }
      for (const spec of valueSpecs(fs.readFileSync(file, "utf8"))) {
        if (
          spec === "zod" ||
          spec === "@prisma/client" ||
          spec.startsWith("@prisma/")
        ) {
          findings.push(
            `${path.relative(root, client)} reaches ${spec} via ${path.relative(root, file)}`
          );
          continue;
        }
        const resolved = resolveImport(file, spec);
        if (resolved) {
          stack.push(resolved);
        }
      }
    }
  }

  return findings;
}

describe("browser-safe staff validation", () => {
  it("keeps clinic membership role names aligned with Prisma", () => {
    expect(clinicRoleNamesMatchPrisma).toBe(true);
    expect(CLINIC_MEMBERSHIP_ROLES).toEqual(["ADMIN", "STAFF"]);
    expect(ClinicMembershipRole.ADMIN).toBe(CLINIC_MEMBERSHIP_ROLE.ADMIN);
    expect(ClinicMembershipRole.STAFF).toBe(CLINIC_MEMBERSHIP_ROLE.STAFF);
    expect(Object.values(ClinicMembershipRole).sort()).toEqual(
      [...CLINIC_MEMBERSHIP_ROLES].sort()
    );
  });

  it("keeps slug helper results identical to the server schema", () => {
    const samples = [
      "demodental",
      "riverside-dental",
      "a1b",
      "ab-cd-12",
      "ab",
      "a".repeat(32),
      "a".repeat(33),
      "DemoDental",
      "-leading",
      "trailing-",
      "double--hyphen",
      "has_underscore",
      "has space",
      "",
      "a-b-c",
    ];
    for (const sample of samples) {
      expect(isValidCareGuideSlug(sample)).toBe(
        careGuideSlugSchema.safeParse(sample).success
      );
    }
  });

  it("keeps login and forgot-password client checks identical to Zod", () => {
    const emails = [
      "",
      "   ",
      "admin@care-guide.test",
      "  Admin@Care-Guide.TEST  ",
      "not-an-email",
      "a@b",
      "user+tag@example.com",
      "a@sub.example.co.uk",
      `${"a".repeat(242)}@example.com`,
      `${"a".repeat(243)}@example.com`,
    ];
    for (const email of emails) {
      const login = loginSchema.safeParse({ email, password: "secret" });
      const forgot = forgotPasswordSchema.safeParse({ email });
      const clientEmail = staffEmailFieldError(email);
      const loginEmail = login.success
        ? undefined
        : login.error.flatten().fieldErrors.email?.[0];
      const forgotEmail = forgot.success
        ? undefined
        : forgot.error.flatten().fieldErrors.email?.[0];
      expect(clientEmail ?? undefined).toBe(loginEmail);
      expect(clientEmail ?? undefined).toBe(forgotEmail);
      if (login.success) {
        expect(normalizeLoginEmail(email)).toBe(login.data.email);
        expect(forgot.success).toBe(true);
        if (forgot.success) {
          expect(forgot.data.email).toBe(login.data.email);
        }
      }
    }

    const passwords = ["", "a", "p".repeat(256), "p".repeat(257)];
    for (const password of passwords) {
      const parsed = loginSchema.safeParse({
        email: "admin@care-guide.test",
        password,
      });
      const client = loginClientFieldErrors({
        email: "admin@care-guide.test",
        password,
      });
      expect(client.password).toBe(
        parsed.success
          ? undefined
          : parsed.error.flatten().fieldErrors.password?.[0]
      );
      expect(client.email).toBeUndefined();
    }
  });

  it("keeps reset and invitation password field errors identical to Zod", () => {
    const cases = [
      ["short", "short"],
      ["short", "different-value"],
      ["abcdefghijkl", "abcdefghijkl"],
      ["abcdefghijkl", "abcdefghijkX"],
      ["p".repeat(256), "p".repeat(256)],
      ["p".repeat(257), "p".repeat(257)],
      ["", ""],
      ["abcdefghijkl", ""],
    ] as const;

    for (const [newPassword, confirmPassword] of cases) {
      const client = newPasswordFieldErrors(newPassword, confirmPassword);
      for (const schema of [resetPasswordSchema, acceptInvitationSchema]) {
        const parsed = schema.safeParse({ newPassword, confirmPassword });
        if (parsed.success) {
          expect(client).toEqual({});
          continue;
        }
        const fieldErrors = parsed.error.flatten().fieldErrors;
        expect(client.newPassword).toBe(fieldErrors.newPassword?.[0]);
        expect(client.confirmPassword).toBe(fieldErrors.confirmPassword?.[0]);
      }
    }
  });

  it("keeps invitation constants and server rejection", () => {
    expect(INVITED_NAME_MAX_LENGTH).toBe(80);
    expect(invitedNameError("")).toBe(INVITED_NAME_REQUIRED_MESSAGE);
    expect(invitedNameError("<b>Ada</b>")).toBe(INVITED_NAME_HTML_MESSAGE);
    expect(invitedNameError("a".repeat(81))).toMatch(/80/);
    expect(invitedNameError("Ada Lovelace")).toBeNull();

    const rejected = inviteClinicUserFormSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      role: "OWNER",
    });
    expect(rejected.success).toBe(false);
    const accepted = inviteClinicUserFormSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      role: "STAFF",
    });
    expect(accepted.success).toBe(true);

    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "" }).success
    ).toBe(false);
    expect(LOGIN_EMAIL_REQUIRED_MESSAGE).toBe("Enter your email address.");
    expect(LOGIN_EMAIL_INVALID_MESSAGE).toBe("Enter a valid email address.");
    expect(LOGIN_EMAIL_TOO_LONG_MESSAGE).toBe("Email address is too long.");
    expect(LOGIN_PASSWORD_REQUIRED_MESSAGE).toBe("Enter your password.");
    expect(LOGIN_PASSWORD_TOO_LONG_MESSAGE).toBe("Password is too long.");
    expect(INVITED_ROLE_INVALID_MESSAGE).toBe("Choose Administrator or Staff.");
  });

  it("does not let client components reach Zod or the Prisma client", () => {
    expect(clientHeavyImports()).toEqual([]);
  });
});
