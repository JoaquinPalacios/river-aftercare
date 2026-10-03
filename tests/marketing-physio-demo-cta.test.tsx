import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingChiropracticPage from "@/app/(marketing)/%5Fmarketing/chiropractic/page";
import MarketingDentalPage from "@/app/(marketing)/%5Fmarketing/dental/page";
import MarketingPhysiotherapyPage from "@/app/(marketing)/%5Fmarketing/physiotherapy/page";
import { PHYSIO_DEMO_EXAMPLE_LABEL } from "@/lib/marketing/physio-demo-link";
import { SHARED_DEMO_PHYSIO_GUIDE_URL } from "@/lib/marketing/shared-demo-links";

const PHYSIO_HERO_LABEL = "View the physiotherapy demo";
const WORKFLOW_LABEL = "See how River Aftercare works";
const REQUEST_LABEL = "Request a demo";

function heroActionsHtml(html: string): string {
  const marker = 'data-mk-hero-actions=""';
  const markerAt = html.indexOf(marker);
  expect(markerAt).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<div", markerAt);
  const close = html.indexOf("</div>", markerAt);
  return html.slice(open, close + "</div>".length);
}

function demoSectionHtml(html: string): string {
  const marker = 'aria-labelledby="physiotherapy-demo"';
  const markerAt = html.indexOf(marker);
  expect(markerAt).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<section", markerAt);
  const close = html.indexOf("</section>", markerAt);
  return html.slice(open, close + "</section>".length);
}

function classNamesForLabel(html: string, label: string): string[] {
  const labelAt = html.indexOf(label);
  expect(labelAt).toBeGreaterThan(-1);
  const tagStart = html.lastIndexOf("<", labelAt);
  const tag = html.slice(tagStart, html.indexOf(">", tagStart));
  const className = tag.match(/class="([^"]*)"/)?.[1] ?? "";
  return className.split(/\s+/).filter(Boolean);
}

describe("physiotherapy live demo CTA", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousPhysioDemo = process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL;
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    if (previousPhysioDemo === undefined) {
      delete process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL;
    } else {
      process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL = previousPhysioDemo;
    }
  });

  it("keeps the disabled placeholder when the public URL is unset", async () => {
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const hero = heroActionsHtml(html);

    expect(hero).toContain(REQUEST_LABEL);
    expect(hero).toContain(WORKFLOW_LABEL);
    expect(hero).toContain('href="#workflow"');
    expect(hero).toContain(PHYSIO_DEMO_EXAMPLE_LABEL);
    expect(hero).toContain('data-live-example="unavailable"');
    expect(hero).toContain("disabled");
    expect(hero).toContain('aria-disabled="true"');
    expect(hero).not.toContain(PHYSIO_HERO_LABEL);
    expect(hero).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(hero).not.toContain('target="_blank"');
    expect(html).not.toContain(PHYSIO_HERO_LABEL);
    expect(html).not.toContain('data-live-example="ready"');
    expect(html).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(demoSectionHtml(html)).not.toContain(WORKFLOW_LABEL);
  });

  it.each([
    "",
    "   ",
    "demo.riveraftercare.com.au/home-exercise-plan",
    "https://demophysio.riveraftercare.com.au/home-exercise-plan",
    "https://demo.riveraftercare.com.au/extraction",
    "https://demo.riveraftercare.com.au/home-exercise-plan?ok=1",
    "https://demo.riveraftercare.com.au/home-exercise-plan#guide",
    "http://demo.riveraftercare.com.au/home-exercise-plan",
  ])("keeps the disabled placeholder for an invalid URL %j", async (value) => {
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL = value;
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const hero = heroActionsHtml(html);

    expect(hero).toContain('data-live-example="unavailable"');
    expect(hero).toContain(PHYSIO_DEMO_EXAMPLE_LABEL);
    expect(hero).toContain(WORKFLOW_LABEL);
    expect(html).not.toContain(PHYSIO_HERO_LABEL);
    expect(html).not.toContain('data-live-example="ready"');
    expect(html).not.toContain(`href="${SHARED_DEMO_PHYSIO_GUIDE_URL}"`);
  });

  it("places the verified demo beside Request a demo and opens it in a new tab", async () => {
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL =
      SHARED_DEMO_PHYSIO_GUIDE_URL;
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const dental = renderToStaticMarkup(await MarketingDentalPage());
    const hero = heroActionsHtml(html);
    const dentalHero = heroActionsHtml(dental);
    const demoSection = demoSectionHtml(html);

    expect(hero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(dentalHero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(hero.indexOf(REQUEST_LABEL)).toBeLessThan(
      hero.indexOf(PHYSIO_HERO_LABEL)
    );
    expect(hero).not.toContain(WORKFLOW_LABEL);
    expect(hero).not.toContain(PHYSIO_DEMO_EXAMPLE_LABEL);
    expect(hero).not.toContain('data-live-example="unavailable"');

    const demoTagStart = hero.lastIndexOf(
      "<a",
      hero.indexOf(PHYSIO_HERO_LABEL)
    );
    const demoTag = hero.slice(demoTagStart, hero.indexOf(">", demoTagStart));
    expect(demoTag).toContain(`href="${SHARED_DEMO_PHYSIO_GUIDE_URL}"`);
    expect(demoTag).toContain('target="_blank"');
    expect(demoTag).toContain('rel="noopener noreferrer"');
    expect(demoTag).toContain('data-live-example="ready"');
    expect(classNamesForLabel(hero, PHYSIO_HERO_LABEL)).toEqual(
      classNamesForLabel(dentalHero, "View the dental demo")
    );
    expect(classNamesForLabel(hero, REQUEST_LABEL)).toEqual(
      classNamesForLabel(dentalHero, REQUEST_LABEL)
    );
    expect(hero).toContain("heroActions");
    expect(dentalHero).toContain("heroActions");

    expect(demoSection).toContain(PHYSIO_DEMO_EXAMPLE_LABEL);
    expect(demoSection).toContain(`href="${SHARED_DEMO_PHYSIO_GUIDE_URL}"`);
    expect(demoSection).toContain('target="_blank"');
    expect(demoSection).toContain('rel="noopener noreferrer"');
    expect(demoSection).toContain(WORKFLOW_LABEL);
    expect(demoSection).toContain('href="#workflow"');
    expect(
      html.match(new RegExp(SHARED_DEMO_PHYSIO_GUIDE_URL, "g"))
    ).toHaveLength(2);
  });

  it("accepts a trailing slash and still links the canonical guide URL", async () => {
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL = `${SHARED_DEMO_PHYSIO_GUIDE_URL}/`;
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const hero = heroActionsHtml(html);

    expect(hero).toContain(`href="${SHARED_DEMO_PHYSIO_GUIDE_URL}"`);
    expect(hero).not.toContain(`${SHARED_DEMO_PHYSIO_GUIDE_URL}/"`);
    expect(hero).toContain(PHYSIO_HERO_LABEL);
  });

  it("does not add the physiotherapy demo to other clinic pages", async () => {
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL =
      SHARED_DEMO_PHYSIO_GUIDE_URL;
    const chiro = renderToStaticMarkup(await MarketingChiropracticPage());
    const dental = renderToStaticMarkup(await MarketingDentalPage());

    expect(chiro).not.toContain(PHYSIO_HERO_LABEL);
    expect(chiro).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(heroActionsHtml(chiro)).toContain("See how it works");
    expect(dental).not.toContain(PHYSIO_HERO_LABEL);
    expect(dental).toContain("View the dental demo");
  });
});
