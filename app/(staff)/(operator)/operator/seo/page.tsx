import type { Metadata } from "next";

import { CopyJsonButton } from "@/app/(staff)/(operator)/operator/seo/copy-json-button";
import { SeoDiscoveryForm } from "@/app/(staff)/(operator)/operator/seo/seo-discovery-form";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { isClinicAssetStorageConfigured } from "@/lib/clinic-assets/config";
import { resolvePlatformSeoOgImageUrl } from "@/lib/platform-assets/public-url";
import { buildSeoDiagnostics } from "@/lib/seo/diagnostics";
import { buildMarketingJsonLdGraph } from "@/lib/seo/json-ld";
import {
  loadAllMarketingPageSeo,
  loadPlatformSeoIdentity,
} from "@/lib/seo/load-platform-seo";
import { DEDICATED_OG_IMAGE_REQUIRED } from "@/lib/seo/og-policy";
import { resolveMarketingSeo } from "@/lib/seo/resolve-marketing-seo";
import { serializeJsonLd } from "@/lib/seo/serialize-json-ld";
import { GUIDE_INDEXING_REQUIREMENTS } from "@/lib/seo/search-visibility";

export const metadata: Metadata = {
  title: `SEO & Discovery · ${PRODUCT_NAME}`,
};

export default async function OperatorSeoPage() {
  await requirePlatformOperator();
  const [identity, pages] = await Promise.all([
    loadPlatformSeoIdentity(),
    loadAllMarketingPageSeo(),
  ]);
  const diagnostics = buildSeoDiagnostics({ identity, pages });
  const home = resolveMarketingSeo({
    path: "/",
    platform: identity,
    page: pages.find((page) => page.path === "/"),
  });
  const jsonLd = buildMarketingJsonLdGraph(home);
  const serialized = serializeJsonLd(jsonLd);
  const ogConfigured = diagnostics.some(
    (item) => item.id === "og-image" && item.status === "complete"
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          SEO & Discovery
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          Structured metadata for the {PRODUCT_NAME} publishing platform. This
          is not a generic CMS and does not accept raw JSON-LD.
        </p>
      </header>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="seo-diagnostics"
      >
        <h2
          id="seo-diagnostics"
          className="text-lg font-semibold tracking-tight"
        >
          Diagnostics
        </h2>
        <ul className="divide-y divide-staff-line overflow-hidden rounded-xl border border-staff-line">
          {diagnostics.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-sm text-staff-muted">{item.detail}</p>
              </div>
              <p className="text-sm font-medium">
                {item.status === "complete" ? "Complete" : "Needs attention"}
              </p>
            </li>
          ))}
        </ul>
        {ogConfigured ? null : (
          <p className="text-sm text-staff-muted">
            {DEDICATED_OG_IMAGE_REQUIRED}
          </p>
        )}
      </section>

      <SeoDiscoveryForm
        identity={identity}
        pages={pages}
        storageAvailable={isClinicAssetStorageConfigured()}
        ogImageSrc={resolvePlatformSeoOgImageUrl(identity.defaultOgImagePath)}
      />

      <section className="flex flex-col gap-3" aria-labelledby="seo-jsonld">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="seo-jsonld"
              className="text-lg font-semibold tracking-tight"
            >
              Structured data
            </h2>
            <p className="mt-1 text-sm text-staff-muted">
              Read-only preview of generated Organization, WebSite, and
              SoftwareApplication JSON-LD. Operators cannot paste raw markup.
            </p>
          </div>
          <CopyJsonButton label="JSON-LD" text={serialized} />
        </div>
        <pre className="overflow-x-auto rounded-xl border border-staff-line bg-staff-canvas p-4 text-sm whitespace-pre-wrap">
          {JSON.stringify(jsonLd, null, 2)}
        </pre>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="seo-agents">
        <h2 id="seo-agents" className="text-lg font-semibold tracking-tight">
          AI / agent discovery
        </h2>
        <p className="text-sm text-staff-muted">
          Public agents can read <code>/llms.txt</code>, generated from this
          identity and the public marketing routes. There is no public API, MCP
          server, or agent skill surface. Those will only be added if clinic
          integrations or an automation ecosystem actually need them.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="seo-visibility">
        <h2
          id="seo-visibility"
          className="text-lg font-semibold tracking-tight"
        >
          Search visibility
        </h2>
        <p className="text-sm text-staff-muted">
          Marketing pages are indexable. Privacy and Terms default to noindex
          while they remain drafts for legal review; links may still be
          followed. Staff, operator, and authenticated preview stay noindex.
          Clinic tenant guides stay <strong>private from search</strong> at
          launch, even when they have complete title, description, canonical,
          and Open Graph tags for patient sharing.
        </p>
        <p className="text-sm text-staff-muted">
          A future INDEXABLE state is reserved for published clinic or editorial
          pages that also meet:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-staff-muted">
          {GUIDE_INDEXING_REQUIREMENTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-staff-muted">
          White-label patient guides remain on the clinic hostname. Indexable
          River Aftercare editorial content, if added later, would live on the
          marketing host — for example{" "}
          <code>/guides/tooth-extraction-aftercare</code> — and is not built in
          this phase.
        </p>
      </section>
    </div>
  );
}
