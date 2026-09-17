import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

function requestFor(
  url: string,
  headers?: Record<string, string>
): NextRequest {
  const parsed = new URL(url);
  return new NextRequest(url, {
    headers: {
      host: parsed.host,
      ...headers,
    },
  });
}

function rewrittenUrl(response: Response): URL | null {
  const rewrite =
    response.headers.get("x-middleware-rewrite") ??
    response.headers.get("x-nextjs-rewrite");
  return rewrite ? new URL(rewrite) : null;
}

describe("proxy", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("rewrites a tenant host to /_sites/<slug>/...", () => {
    const response = proxy(
      requestFor("http://demodental.localhost:3000/extraction")
    );
    const rewritten = rewrittenUrl(response);
    expect(rewritten?.pathname).toBe("/_sites/demodental/extraction");
  });

  it("preserves the query string on tenant rewrites", () => {
    const response = proxy(
      requestFor("http://demodental.localhost:3000/extraction?ref=qr")
    );
    const rewritten = rewrittenUrl(response);
    expect(rewritten?.pathname).toBe("/_sites/demodental/extraction");
    expect(rewritten?.search).toBe("?ref=qr");
  });

  it("rewrites the apex homepage to /_marketing", () => {
    const response = proxy(requestFor("http://localhost:3000/"));
    const rewritten = rewrittenUrl(response);
    expect(response.status).toBe(200);
    expect(rewritten?.pathname).toBe("/_marketing");
  });

  it("blocks staff paths on the marketing host", () => {
    expect(proxy(requestFor("http://localhost:3000/login")).status).toBe(404);
    expect(proxy(requestFor("http://localhost:3000/dashboard")).status).toBe(
      404
    );
    expect(proxy(requestFor("http://localhost:3000/sessions/new")).status).toBe(
      404
    );
  });

  it("rewrites marketing pricing, contact, about, privacy, terms, and clinic pages to /_marketing/...", () => {
    const pricing = proxy(requestFor("http://localhost:3000/pricing"));
    expect(pricing.status).toBe(200);
    expect(rewrittenUrl(pricing)?.pathname).toBe("/_marketing/pricing");

    const contact = proxy(requestFor("http://localhost:3000/contact"));
    expect(contact.status).toBe(200);
    expect(rewrittenUrl(contact)?.pathname).toBe("/_marketing/contact");

    const about = proxy(requestFor("http://localhost:3000/about"));
    expect(about.status).toBe(200);
    expect(rewrittenUrl(about)?.pathname).toBe("/_marketing/about");

    const privacy = proxy(requestFor("http://localhost:3000/privacy"));
    expect(privacy.status).toBe(200);
    expect(rewrittenUrl(privacy)?.pathname).toBe("/_marketing/privacy");

    const terms = proxy(requestFor("http://localhost:3000/terms"));
    expect(terms.status).toBe(200);
    expect(rewrittenUrl(terms)?.pathname).toBe("/_marketing/terms");

    const dental = proxy(requestFor("http://localhost:3000/dental"));
    expect(dental.status).toBe(200);
    expect(rewrittenUrl(dental)?.pathname).toBe("/_marketing/dental");

    const physiotherapy = proxy(
      requestFor("http://localhost:3000/physiotherapy")
    );
    expect(physiotherapy.status).toBe(200);
    expect(rewrittenUrl(physiotherapy)?.pathname).toBe(
      "/_marketing/physiotherapy"
    );

    const chiropractic = proxy(
      requestFor("http://localhost:3000/chiropractic")
    );
    expect(chiropractic.status).toBe(200);
    expect(rewrittenUrl(chiropractic)?.pathname).toBe(
      "/_marketing/chiropractic"
    );

    const cosmetic = proxy(
      requestFor("http://localhost:3000/cosmetic-clinics")
    );
    expect(cosmetic.status).toBe(200);
    expect(rewrittenUrl(cosmetic)?.pathname).toBe(
      "/_marketing/cosmetic-clinics"
    );
  });

  it("lets sitemap, robots, and llms.txt pass through on the marketing host", () => {
    const sitemap = proxy(requestFor("http://localhost:3000/sitemap.xml"));
    expect(sitemap.status).toBe(200);
    expect(rewrittenUrl(sitemap)).toBeNull();

    const robots = proxy(requestFor("http://localhost:3000/robots.txt"));
    expect(robots.status).toBe(200);
    expect(rewrittenUrl(robots)).toBeNull();

    const llms = proxy(requestFor("http://localhost:3000/llms.txt"));
    expect(llms.status).toBe(200);
    expect(rewrittenUrl(llms)).toBeNull();
  });

  it("does not rewrite tenant /pricing or /contact to marketing", () => {
    const pricing = proxy(
      requestFor("http://demodental.localhost:3000/pricing")
    );
    expect(rewrittenUrl(pricing)?.pathname).toBe("/_sites/demodental/pricing");

    const contact = proxy(
      requestFor("http://demodental.localhost:3000/contact")
    );
    expect(rewrittenUrl(contact)?.pathname).toBe("/_sites/demodental/contact");
  });

  it("does not rewrite staff /pricing or /contact to marketing", () => {
    const pricing = proxy(requestFor("http://app.localhost:3000/pricing"));
    expect(pricing.status).toBe(200);
    expect(rewrittenUrl(pricing)).toBeNull();

    const contact = proxy(requestFor("http://app.localhost:3000/contact"));
    expect(contact.status).toBe(200);
    expect(rewrittenUrl(contact)).toBeNull();
  });

  it("lets the app staff host pass through", () => {
    const response = proxy(requestFor("http://app.localhost:3000/login"));
    expect(response.status).toBe(200);
    expect(rewrittenUrl(response)).toBeNull();
  });

  it("lets the app staff homepage pass through", () => {
    const response = proxy(requestFor("http://app.localhost:3000/"));
    expect(response.status).toBe(200);
    expect(rewrittenUrl(response)).toBeNull();
  });

  it("blocks direct /_sites access on the marketing host", () => {
    const response = proxy(
      requestFor("http://localhost:3000/_sites/demodental/extraction")
    );
    expect(response.status).toBe(404);
    expect(rewrittenUrl(response)).toBeNull();
  });

  it("blocks direct /_marketing access on every public host", () => {
    expect(proxy(requestFor("http://localhost:3000/_marketing")).status).toBe(
      404
    );
    expect(
      proxy(requestFor("http://app.localhost:3000/_marketing")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://demodental.localhost:3000/_marketing")).status
    ).toBe(404);
    expect(proxy(requestFor("http://localhost:3000/%5Fmarketing")).status).toBe(
      404
    );
  });

  it("blocks /_sites on a tenant host without revealing the namespace", () => {
    const response = proxy(
      requestFor(
        "http://demodental.localhost:3000/_sites/demodental/extraction"
      )
    );
    expect(response.status).toBe(404);
    expect(rewrittenUrl(response)).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("blocks tenant /login", () => {
    const response = proxy(
      requestFor("http://demodental.localhost:3000/login")
    );
    expect(response.status).toBe(404);
  });

  it("blocks tenant /dashboard and /guides", () => {
    expect(
      proxy(requestFor("http://demodental.localhost:3000/dashboard")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://demodental.localhost:3000/guides")).status
    ).toBe(404);
  });

  it("blocks tenant /display/<token>", () => {
    const response = proxy(
      requestFor("http://demodental.localhost:3000/display/abc123")
    );
    expect(response.status).toBe(404);
  });

  it("blocks tenant /session and /sessions paths", () => {
    expect(
      proxy(requestFor("http://demodental.localhost:3000/sessions/new")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://demodental.localhost:3000/session/abc/control"))
        .status
    ).toBe(404);
  });

  it("blocks encoded /_sites access", () => {
    const response = proxy(
      requestFor("http://app.localhost:3000/%5Fsites/demodental/extraction")
    );
    expect(response.status).toBe(404);
  });

  it("blocks tenant staff routes after resolving parent-path segments", () => {
    expect(
      proxy(requestFor("http://demodental.localhost:3000/../../../dashboard"))
        .status
    ).toBe(404);
    expect(
      proxy(requestFor("http://demodental.localhost:3000/extraction/../login"))
        .status
    ).toBe(404);
  });

  it("rewrites tenant paths after resolving parent-path segments", () => {
    const response = proxy(
      requestFor("http://demodental.localhost:3000/foo/../extraction")
    );
    expect(rewrittenUrl(response)?.pathname).toBe(
      "/_sites/demodental/extraction"
    );
  });

  it("does not trust a forged tenant header", () => {
    const response = proxy(
      requestFor("http://unknown.localhost:3000/extraction", {
        "x-care-guide-tenant": "demodental",
        "x-tenant": "demodental",
      })
    );
    const rewritten = rewrittenUrl(response);
    expect(rewritten?.pathname).toBe("/_sites/unknown/extraction");
  });

  it("returns 404 for unrelated and suffix-spoof hosts", () => {
    expect(proxy(requestFor("http://evil.example/extraction")).status).toBe(
      404
    );
    expect(
      proxy(requestFor("http://demodental.localhost.evil.example/extraction"))
        .status
    ).toBe(404);
  });

  it("does not treat assets as a tenant host", () => {
    const homepage = proxy(requestFor("http://assets.localhost:3000/"));
    expect(homepage.status).toBe(404);
    expect(rewrittenUrl(homepage)).toBeNull();

    const otherPath = proxy(
      requestFor("http://assets.localhost:3000/extraction")
    );
    expect(otherPath.status).toBe(404);
    expect(rewrittenUrl(otherPath)).toBeNull();
  });

  it("lets the reserved assets host serve exact platform SEO object paths", () => {
    const response = proxy(
      requestFor(
        "http://assets.localhost:3000/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
      )
    );
    expect(response.status).toBe(200);
    expect(rewrittenUrl(response)).toBeNull();
  });

  it("does not list platform SEO prefixes on the assets host", () => {
    expect(
      proxy(requestFor("http://assets.localhost:3000/platform")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://assets.localhost:3000/platform/seo")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://assets.localhost:3000/platform/seo/")).status
    ).toBe(404);
  });

  it("lets the reserved assets host serve exact branding object paths", () => {
    const response = proxy(
      requestFor(
        "http://assets.localhost:3000/clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
      )
    );
    expect(response.status).toBe(200);
    expect(rewrittenUrl(response)).toBeNull();
  });

  it("does not list branding prefixes on the assets host", () => {
    expect(
      proxy(requestFor("http://assets.localhost:3000/clinics")).status
    ).toBe(404);
    expect(
      proxy(requestFor("http://assets.localhost:3000/clinics/clinic_a")).status
    ).toBe(404);
    expect(
      proxy(
        requestFor("http://assets.localhost:3000/clinics/clinic_a/branding")
      ).status
    ).toBe(404);
    expect(
      proxy(
        requestFor("http://assets.localhost:3000/clinics/clinic_a/branding/")
      ).status
    ).toBe(404);
  });

  it("still 404s branding paths on other reserved hosts", () => {
    expect(
      proxy(
        requestFor(
          "http://cdn.localhost:3000/clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
        )
      ).status
    ).toBe(404);
  });

  it("excludes framework static assets from the matcher", () => {
    const matchers = Array.isArray(config.matcher)
      ? config.matcher
      : [config.matcher];
    const source = matchers
      .map((entry) => (typeof entry === "string" ? entry : String(entry)))
      .join(" ");
    expect(source).toContain("_next/static");
    expect(source).toContain("_next/image");
    expect(source).toContain("favicon.ico");
  });
});
