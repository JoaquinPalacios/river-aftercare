import { describe, expect, it } from "vitest";

import { parseHostname } from "@/lib/tenancy/parse-hostname";

const LOCAL_ROOT = "localhost";
const PROD_ROOT = "example.com";

describe("parseHostname", () => {
  it("classifies localhost:3000 as the public marketing host", () => {
    expect(parseHostname("localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "marketing",
    });
  });

  it("classifies app.localhost:3000 as staff", () => {
    expect(parseHostname("app.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "staff",
    });
  });

  it("classifies demodental.localhost:3000 as a tenant", () => {
    expect(parseHostname("demodental.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "tenant",
      slug: "demodental",
    });
  });

  it("classifies production-shaped <slug>.<root> as a tenant", () => {
    expect(parseHostname("demodental.example.com", PROD_ROOT)).toEqual({
      kind: "tenant",
      slug: "demodental",
    });
  });

  it("classifies production apex as marketing and app as staff", () => {
    expect(parseHostname("example.com", PROD_ROOT)).toEqual({
      kind: "marketing",
    });
    expect(parseHostname("app.example.com", PROD_ROOT)).toEqual({
      kind: "staff",
    });
  });

  it("classifies reserved subdomains as non-tenant", () => {
    expect(parseHostname("www.localhost", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "www",
    });
    expect(parseHostname("pricing.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "pricing",
    });
    expect(parseHostname("contact.example.com", PROD_ROOT)).toEqual({
      kind: "reserved",
      label: "contact",
    });
    expect(parseHostname("about.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "about",
    });
    expect(parseHostname("admin.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "admin",
    });
    expect(parseHostname("api.example.com", PROD_ROOT)).toEqual({
      kind: "reserved",
      label: "api",
    });
    expect(parseHostname("operator.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "operator",
    });
    expect(parseHostname("assets.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "reserved",
      label: "assets",
    });
    expect(parseHostname("assets.example.com", PROD_ROOT)).toEqual({
      kind: "reserved",
      label: "assets",
    });
  });

  it("rejects an unrelated domain", () => {
    expect(parseHostname("evil.example", LOCAL_ROOT)).toEqual({
      kind: "invalid",
    });
    expect(parseHostname("demodental.other.com", PROD_ROOT)).toEqual({
      kind: "invalid",
    });
  });

  it("rejects suffix-spoof domains", () => {
    expect(
      parseHostname("demodental.localhost.evil.example", LOCAL_ROOT)
    ).toEqual({ kind: "invalid" });
    expect(
      parseHostname("demodental.example.com.evil.example", PROD_ROOT)
    ).toEqual({ kind: "invalid" });
  });

  it("rejects extra hostname labels", () => {
    expect(parseHostname("foo.bar.localhost", LOCAL_ROOT)).toEqual({
      kind: "invalid",
    });
    expect(parseHostname("a.b.example.com", PROD_ROOT)).toEqual({
      kind: "invalid",
    });
  });

  it("rejects a malformed or empty host", () => {
    expect(parseHostname("", LOCAL_ROOT)).toEqual({ kind: "invalid" });
    expect(parseHostname("   ", LOCAL_ROOT)).toEqual({ kind: "invalid" });
    expect(parseHostname(null, LOCAL_ROOT)).toEqual({ kind: "invalid" });
    expect(parseHostname("localhost:abc", LOCAL_ROOT)).toEqual({
      kind: "invalid",
    });
    expect(parseHostname("demodental.localhost:3000/path", LOCAL_ROOT)).toEqual(
      {
        kind: "invalid",
      }
    );
  });

  it("strips the port before classifying", () => {
    expect(parseHostname("demodental.localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "tenant",
      slug: "demodental",
    });
    expect(parseHostname("localhost:3000", LOCAL_ROOT)).toEqual({
      kind: "marketing",
    });
  });

  it("normalizes uppercase hostnames", () => {
    expect(parseHostname("DemoDental.LocalHost:3000", LOCAL_ROOT)).toEqual({
      kind: "tenant",
      slug: "demodental",
    });
    expect(parseHostname("APP.EXAMPLE.COM", PROD_ROOT)).toEqual({
      kind: "staff",
    });
  });
});
