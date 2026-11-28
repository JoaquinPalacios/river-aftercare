import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingAboutPage from "@/app/(marketing)/%5Fmarketing/about/page";
import MarketingClinicsPage from "@/app/(marketing)/%5Fmarketing/clinics/page";
import MarketingDentalPage from "@/app/(marketing)/%5Fmarketing/dental/page";
import MarketingHomePage from "@/app/(marketing)/%5Fmarketing/page";
import MarketingPricingPage from "@/app/(marketing)/%5Fmarketing/pricing/page";
import {
  cataloguePlanCta,
  START_FREE_TRIAL_LABEL,
} from "@/lib/marketing/registration-cta";
import { marketingRegistrationOffer } from "@/lib/marketing/registration-offer";
import { staffAppOrigin } from "@/lib/tenancy/staff-app-origin";

const REGISTER_LABEL = `>${START_FREE_TRIAL_LABEL}<`;

function planCard(html: string, id: string): string {
  const marker = `data-plan-card="${id}"`;
  const start = html.indexOf(marker);
  expect(start, id).toBeGreaterThan(-1);
  const end = html.indexOf("</article>", start);
  expect(end, id).toBeGreaterThan(start);
  return html.slice(start, end);
}

function between(html: string, startMarker: string, endMarker: string): string {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe("self-service registration CTAs", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousRegistration = process.env.REGISTRATION_ENABLED;

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    if (previousRegistration === undefined) {
      delete process.env.REGISTRATION_ENABLED;
    } else {
      process.env.REGISTRATION_ENABLED = previousRegistration;
    }
  });

  it("keeps the offer off unless REGISTRATION_ENABLED is exactly true", () => {
    const env = (values: Record<string, string>): NodeJS.ProcessEnv =>
      values as unknown as NodeJS.ProcessEnv;

    expect(marketingRegistrationOffer(env({})).enabled).toBe(false);
    expect(
      marketingRegistrationOffer(env({ REGISTRATION_ENABLED: "false" })).enabled
    ).toBe(false);
    expect(
      marketingRegistrationOffer(env({ REGISTRATION_ENABLED: "1" })).enabled
    ).toBe(false);

    const enabled = marketingRegistrationOffer(
      env({
        REGISTRATION_ENABLED: " TRUE ",
        CARE_GUIDE_ROOT_DOMAIN: "riveraftercare.com.au",
      })
    );
    expect(enabled).toEqual({
      enabled: true,
      href: "https://app.riveraftercare.com.au/register",
      label: START_FREE_TRIAL_LABEL,
    });
  });

  it("does not put a plan, interval, or Group onto the registration link", () => {
    const offer = {
      enabled: true,
      href: "https://app.example.com/register",
      label: START_FREE_TRIAL_LABEL,
    } as const;
    const essential = cataloguePlanCta(
      { id: "essential", ctaLabel: "Request a demo", ctaHref: "/contact" },
      offer
    );
    expect(essential).toEqual({
      label: START_FREE_TRIAL_LABEL,
      href: "https://app.example.com/register",
      assisted: { label: "Request a demo", href: "/contact" },
    });
    expect(essential.href).not.toContain("?");

    expect(
      cataloguePlanCta(
        { id: "group", ctaLabel: "Talk to us", ctaHref: "/contact" },
        offer
      )
    ).toEqual({
      label: "Talk to us",
      href: "/contact",
      assisted: null,
    });

    const disabled = { enabled: false as const };
    expect(
      cataloguePlanCta(
        { id: "practice", ctaLabel: "Request a demo", ctaHref: "/contact" },
        disabled
      ).href
    ).toBe("/contact");
  });

  it("reads the flag at build time without a request or a second flag", () => {
    const offer = readFileSync("lib/marketing/registration-offer.ts", "utf8");
    const registerPage = readFileSync("app/(staff)/register/page.tsx", "utf8");

    expect(offer).toContain("isRegistrationEnabled");
    expect(offer).toContain('import "server-only"');
    expect(offer).not.toContain("headers(");
    expect(offer).not.toContain("cookies(");
    expect(offer).not.toContain("NEXT_PUBLIC_");
    expect(offer).not.toContain("getPrisma");
    expect(registerPage).not.toContain("searchParams");
    expect(
      readFileSync("app/(marketing)/marketing.module.css", "utf8")
    ).toContain(".nav a.navTrial");
  });

  it("preserves the current marketing CTAs while registration is disabled", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.REGISTRATION_ENABLED;

    const home = renderToStaticMarkup(await MarketingHomePage());
    const pricing = renderToStaticMarkup(await MarketingPricingPage());
    const clinics = renderToStaticMarkup(await MarketingClinicsPage());
    const dental = renderToStaticMarkup(await MarketingDentalPage());

    for (const html of [home, pricing, clinics, dental]) {
      expect(html).not.toContain(START_FREE_TRIAL_LABEL);
      expect(html).not.toContain("/register");
    }

    expect(home).toContain("View the demo");
    expect(home).toContain("See how it works");
    expect(home).toContain("Request a demo");
    expect(home).toContain(">Bring your aftercare online.<");

    expect(pricing).toContain(
      "Professional aftercare, built around your practice."
    );
    expect(pricing).toContain(
      "Essential and Practice include a 14-day free trial."
    );
    expect(planCard(pricing, "essential")).toContain("Request a demo");
    expect(planCard(pricing, "essential")).toContain('href="/contact"');
    expect(planCard(pricing, "practice")).toContain("Request a demo");
    expect(planCard(pricing, "group")).toContain("Talk to us");
    expect(planCard(pricing, "group")).toContain('href="/contact"');
    expect(pricing).toContain(">Tell us about your practice.<");
    expect(pricing).toContain(
      "Group is arranged with River Aftercare and does not include this trial."
    );

    expect(clinics).toContain("Request a demo");
    expect(clinics).toContain("Tell us about your clinic");
    expect(dental).toContain("Request a demo");
    expect(dental).toContain("View pricing");
  });

  it("links Essential and Practice to registration and leaves Group assisted", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    process.env.REGISTRATION_ENABLED = "true";
    const registerHref = `${staffAppOrigin()}/register`;

    const home = renderToStaticMarkup(await MarketingHomePage());
    const pricing = renderToStaticMarkup(await MarketingPricingPage());
    const clinics = renderToStaticMarkup(await MarketingClinicsPage());
    const dental = renderToStaticMarkup(await MarketingDentalPage());
    const about = renderToStaticMarkup(await MarketingAboutPage());

    const homeHero = between(home, "<main", 'data-mk-chapter="closing"');
    expect(homeHero).toContain("View the demo");
    expect(homeHero).toContain("See how it works");
    expect(homeHero).not.toContain(START_FREE_TRIAL_LABEL);
    expect(homeHero).not.toContain("/register");
    expect(home).toContain(
      "Digital patient aftercare for clinics and practices"
    );
    expect(home).not.toContain("14-day free trial");

    const homeClose = between(home, 'data-mk-chapter="closing"', "<footer");
    expect(homeClose).toContain("Request a demo");
    expect(homeClose).toContain(REGISTER_LABEL);
    expect(homeClose).toContain(`href="${registerHref}"`);
    expect(home.slice(home.lastIndexOf("<footer"))).not.toContain(
      START_FREE_TRIAL_LABEL
    );
    expect((home.match(new RegExp(REGISTER_LABEL, "g")) ?? []).length).toBe(3);

    expect(pricing).toContain(
      "Professional aftercare, built around your practice."
    );
    expect(pricing).toContain(
      "Essential and Practice include a 14-day free trial."
    );
    expect(pricing).toContain(
      "14-day free trial. Payment details are collected, and this plan starts charging after the trial unless you cancel first."
    );
    expect(pricing).toContain(
      "Group is arranged with River Aftercare and does not include this trial."
    );
    expect(pricing).toContain(">Tell us about your practice.<");

    for (const id of ["essential", "practice"] as const) {
      const card = planCard(pricing, id);
      expect(card).toContain(REGISTER_LABEL);
      expect(card).toContain(`href="${registerHref}"`);
      expect(card).toContain("Request a demo");
      expect(card).toContain('href="/contact"');
      expect(card).not.toContain(`${registerHref}?`);
    }

    const group = planCard(pricing, "group");
    expect(group).toContain("Talk to us");
    expect(group).toContain('href="/contact"');
    expect(group).not.toContain(START_FREE_TRIAL_LABEL);
    expect(group).not.toContain("/register");

    const dentalMain = between(dental, "<main", 'data-mk-chapter="closing"');
    expect(dentalMain).toContain("Request a demo");
    expect(dentalMain).not.toContain("/register");
    const dentalClose = between(dental, 'data-mk-chapter="closing"', "<footer");
    expect(dentalClose).toContain("Request a demo");
    expect(dentalClose).toContain("View pricing");
    expect(dentalClose).toContain(`href="${registerHref}"`);

    const clinicsMain = between(clinics, "<main", 'data-mk-chapter="closing"');
    expect(clinicsMain).toContain("Request a demo");
    expect(clinicsMain).toContain("Tell us about your clinic");
    expect(clinicsMain).not.toContain("/register");
    expect(between(clinics, 'data-mk-chapter="closing"', "<footer")).toContain(
      REGISTER_LABEL
    );

    const aboutClose = between(about, 'data-mk-chapter="closing"', "<footer");
    expect(aboutClose).toContain("Request a demo");
    expect(aboutClose).toContain("View pricing");
    expect(aboutClose).not.toContain(START_FREE_TRIAL_LABEL);
    expect((about.match(new RegExp(REGISTER_LABEL, "g")) ?? []).length).toBe(2);

    for (const html of [home, pricing, clinics, dental, about]) {
      expect(html).toContain(`href="${registerHref}"`);
      expect(html).not.toContain("commercialPlan=");
      expect(html).not.toContain("billingInterval=");
    }
  });
});
