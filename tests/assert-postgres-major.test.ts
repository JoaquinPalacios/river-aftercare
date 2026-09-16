import { describe, expect, it } from "vitest";

import {
  assertPostgresMajor,
  postgresMajorFromServerVersion,
} from "@/lib/db/assert-postgres-major";

describe("assertPostgresMajor", () => {
  it("accepts PostgreSQL 18 server_version strings", () => {
    expect(postgresMajorFromServerVersion("18.0")).toBe(18);
    expect(postgresMajorFromServerVersion("18.1")).toBe(18);
    expect(() => assertPostgresMajor("18.0")).not.toThrow();
  });

  it("rejects other majors", () => {
    expect(() => assertPostgresMajor("17.6")).toThrow(/requires PostgreSQL 18/);
    expect(() => assertPostgresMajor("19.0")).toThrow(/requires PostgreSQL 18/);
  });
});
