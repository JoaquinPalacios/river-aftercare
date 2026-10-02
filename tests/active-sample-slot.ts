import { Client } from "pg";
import type { ServiceCategory } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import {
  assignPrimarySiteServiceCategories,
  listAccountServiceCategories,
} from "@/lib/clinics/site-service-categories";

/**
 * Serializes tests that create an active sample in the same service category.
 * The connection is dedicated so the session advisory lock survives pooled
 * Prisma queries inside the callback.
 */
export async function withSampleCategoryLock<T>(
  categories: readonly ServiceCategory[],
  fn: () => Promise<T>
): Promise<T> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  const client = new Client({ connectionString });
  await client.connect();
  const keys = [...new Set(categories)]
    .sort()
    .map((category) => `test-active-sample:${category}`);
  try {
    for (const key of keys) {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    }
    return await fn();
  } finally {
    for (const key of [...keys].reverse()) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
    }
    await client.end();
  }
}

/**
 * Adds one category to a clinic for the callback, then restores the previous
 * primary-site categories. Holds the sample-category lock and a demodental
 * category lock so parallel tests do not rewrite the same site.
 */
export async function withTemporaryClinicCategory<T>(
  clinicId: string,
  category: ServiceCategory,
  fn: () => Promise<T>
): Promise<T> {
  return withSampleCategoryLock([category], async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL is required.");
    }
    const client = new Client({ connectionString });
    await client.connect();
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      "test-clinic-service-categories",
    ]);
    const previous = await listAccountServiceCategories(getPrisma(), clinicId);
    const expanded = previous.includes(category)
      ? previous
      : [...previous, category];
    if (!previous.includes(category)) {
      await assignPrimarySiteServiceCategories(getPrisma(), clinicId, expanded);
    }
    try {
      return await fn();
    } finally {
      await assignPrimarySiteServiceCategories(getPrisma(), clinicId, previous);
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        "test-clinic-service-categories",
      ]);
      await client.end();
    }
  });
}
