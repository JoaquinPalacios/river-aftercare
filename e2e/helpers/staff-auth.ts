import { expect, type Page } from "@playwright/test";

import {
  resolveLocalLoginSeed,
  type LocalLoginRole,
} from "@/lib/dev/local-login-accounts";

import { staffUrl } from "./origins";

function developmentCredentials(role: LocalLoginRole): {
  email: string;
  password: string;
} | null {
  const plan = resolveLocalLoginSeed();
  if (plan.status === "invalid" || plan.status === "refused") {
    throw new Error(plan.reason);
  }
  if (plan.status !== "seed") {
    return null;
  }
  const account = plan.accounts.find((item) => item.role === role);
  if (!account) {
    return null;
  }
  return { email: account.email, password: account.password };
}

export function localAdminCredentials(): {
  email: string;
  password: string;
} | null {
  return developmentCredentials("ADMIN");
}

export function localStaffCredentials(): {
  email: string;
  password: string;
} | null {
  return developmentCredentials("STAFF");
}

export function localOperatorCredentials(): {
  email: string;
  password: string;
} | null {
  return developmentCredentials("OPERATOR");
}

async function signInWith(
  page: Page,
  credentials: { email: string; password: string },
  expectedPath: string
): Promise<void> {
  await page.goto(staffUrl("/login"), { waitUntil: "load" });
  await expect(
    page.getByRole("button", { name: "Show password" })
  ).toBeVisible();
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(staffUrl(expectedPath));
}

export async function signInAsLocalAdmin(page: Page): Promise<void> {
  const credentials = localAdminCredentials();
  expect(
    credentials,
    "Admin development credentials must be set (CLOUD_ADMIN_EMAIL and CLOUD_ADMIN_PASSWORD, or LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD)"
  ).not.toBeNull();
  await signInWith(page, credentials!, "/dashboard");
}

export async function signInAsLocalStaff(page: Page): Promise<void> {
  const credentials = localStaffCredentials();
  expect(
    credentials,
    "Staff development credentials must be set (CLOUD_STAFF_EMAIL and CLOUD_STAFF_PASSWORD, or LOCAL_STAFF_EMAIL and LOCAL_STAFF_PASSWORD)"
  ).not.toBeNull();
  await signInWith(page, credentials!, "/dashboard");
}

export async function signInAsLocalOperator(page: Page): Promise<void> {
  const credentials = localOperatorCredentials();
  expect(
    credentials,
    "Operator development credentials must be set (CLOUD_OPERATOR_EMAIL and CLOUD_OPERATOR_PASSWORD, or LOCAL_OPERATOR_EMAIL and LOCAL_OPERATOR_PASSWORD)"
  ).not.toBeNull();
  await signInWith(page, credentials!, "/operator/clinics");
}
