"use client";

import { useActionState, useMemo, useState, type ChangeEvent } from "react";

import { DefaultOgImageField } from "@/app/(staff)/(operator)/operator/seo/og-image-field";
import {
  savePlatformSeoAction,
  type SeoActionState,
} from "@/app/(staff)/(operator)/operator/seo/actions";
import {
  DESCRIPTION_GUIDE_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MARKETING_PAGE_LABELS,
  TITLE_GUIDE_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/seo/defaults";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import {
  MARKETING_SEO_PATHS,
  type MarketingPageSeoInput,
  type MarketingSeoPath,
  type PlatformSeoIdentity,
} from "@/lib/seo/types";

const initial: SeoActionState = {};

const PAGE_KEYS = MARKETING_SEO_PAGE_KEYS;

function fieldError(errors: Record<string, string> | undefined, field: string) {
  return errors?.[field] ? (
    <p className="text-sm text-red-600">{errors[field]}</p>
  ) : null;
}

function CharacterCount({
  value,
  guide,
  max,
}: {
  value: string;
  guide: number;
  max: number;
}) {
  const length = value.length;
  const overGuide = length > guide;
  return (
    <p className="text-sm text-staff-muted">
      {length} / {max} characters
      {overGuide
        ? ` — longer than a typical ${guide}-character search snippet, but still allowed.`
        : "."}
    </p>
  );
}

function TextField({
  id,
  name,
  label,
  defaultValue,
  help,
  error,
  guide,
  max,
  multiline = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  help?: string;
  error?: string;
  guide: number;
  max: number;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const shared = {
    id,
    name,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(event.target.value),
    className:
      "rounded-md border border-staff-line bg-staff-panel px-3 py-2 text-sm",
    maxLength: max,
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} className={`${shared.className} h-11`} />
      )}
      <CharacterCount value={value} guide={guide} max={max} />
      {help ? <p className="text-sm text-staff-muted">{help}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function SerpPreview({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-staff-line bg-staff-canvas px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-staff-muted">
        Search preview
      </p>
      <p className="mt-2 text-base font-medium text-staff-brand">{title}</p>
      <p className="mt-1 text-sm text-staff-muted">{description}</p>
    </div>
  );
}

export function SeoDiscoveryForm({
  identity,
  pages,
  storageAvailable,
  ogImageSrc,
}: {
  identity: PlatformSeoIdentity;
  pages: MarketingPageSeoInput[];
  storageAvailable: boolean;
  ogImageSrc: string | null;
}) {
  const [state, action, pending] = useActionState(
    savePlatformSeoAction,
    initial
  );
  const pagesByPath = useMemo(
    () => new Map(pages.map((page) => [page.path, page])),
    [pages]
  );

  return (
    <form action={action} className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-labelledby="seo-identity">
        <div>
          <h2
            id="seo-identity"
            className="text-lg font-semibold tracking-tight"
          >
            Site identity
          </h2>
          <p className="mt-1 text-sm text-staff-muted">
            Public product identity used for titles, Organization JSON-LD, and
            agent discovery. Canonical URLs stay derived from the production
            domain.
          </p>
        </div>
        <TextField
          id="siteName"
          name="siteName"
          label="Site name"
          defaultValue={identity.siteName}
          guide={40}
          max={80}
          error={state.fieldErrors?.siteName}
        />
        <TextField
          id="organizationName"
          name="organizationName"
          label="Organization name"
          defaultValue={identity.organizationName}
          guide={40}
          max={80}
          error={state.fieldErrors?.organizationName}
        />
        <TextField
          id="defaultDescription"
          name="defaultDescription"
          label="Default description"
          defaultValue={identity.defaultDescription}
          guide={DESCRIPTION_GUIDE_LENGTH}
          max={DESCRIPTION_MAX_LENGTH}
          multiline
          error={state.fieldErrors?.defaultDescription}
        />
        <TextField
          id="organizationDescription"
          name="organizationDescription"
          label="Public organization description"
          defaultValue={identity.organizationDescription}
          guide={DESCRIPTION_GUIDE_LENGTH}
          max={400}
          multiline
          error={state.fieldErrors?.organizationDescription}
        />
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="publicContactEmail">
            Public business contact email
          </label>
          <input
            id="publicContactEmail"
            name="publicContactEmail"
            type="email"
            defaultValue={identity.publicContactEmail ?? ""}
            className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
            autoComplete="off"
          />
          <p className="text-sm text-staff-muted">
            Optional. Shown in Organization JSON-LD only when set. Do not
            publish internal operator mailboxes.
          </p>
          {fieldError(state.fieldErrors, "publicContactEmail")}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="seo-social">
        <div>
          <h2 id="seo-social" className="text-lg font-semibold tracking-tight">
            Social sharing
          </h2>
          <p className="mt-1 text-sm text-staff-muted">
            Use a dedicated 1200 × 630 social sharing image. Do not stretch the
            River Aftercare logo into a social card. Pages can still set their
            own social image override below.
          </p>
        </div>
        <DefaultOgImageField
          imagePath={identity.defaultOgImagePath}
          imageSrc={ogImageSrc}
          storageAvailable={storageAvailable}
        />
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="sameAsUrls">
            Entity or social URLs
          </label>
          <textarea
            id="sameAsUrls"
            name="sameAsUrls"
            rows={4}
            defaultValue={identity.sameAsUrls.join("\n")}
            className="rounded-md border border-staff-line bg-staff-panel px-3 py-2 text-sm"
            placeholder="One https URL per line"
          />
          <p className="text-sm text-staff-muted">
            Only add accounts that actually exist. Leave blank rather than
            inventing profiles.
          </p>
          {fieldError(state.fieldErrors, "sameAsUrls")}
        </div>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="seo-pages">
        <div>
          <h2 id="seo-pages" className="text-lg font-semibold tracking-tight">
            Marketing pages
          </h2>
          <p className="mt-1 text-sm text-staff-muted">
            Edit content metadata. Routing and canonical URLs are not editable.
            Social fields fall back to the page title and description, then the
            platform default.
          </p>
        </div>
        {MARKETING_SEO_PATHS.map((path) => {
          const key = PAGE_KEYS[path];
          const page = pagesByPath.get(path);
          const title = page?.seoTitle ?? "";
          const description = page?.metaDescription ?? "";
          return (
            <fieldset
              key={path}
              className="flex flex-col gap-4 rounded-xl border border-staff-line bg-staff-panel p-5"
            >
              <legend className="px-1 text-sm font-semibold">
                {MARKETING_PAGE_LABELS[path]}{" "}
                <span className="font-normal text-staff-muted">{path}</span>
              </legend>
              <SerpPreview title={title} description={description} />
              <TextField
                id={`${key}SeoTitle`}
                name={`${key}SeoTitle`}
                label="SEO title"
                defaultValue={title}
                guide={TITLE_GUIDE_LENGTH}
                max={TITLE_MAX_LENGTH}
                error={state.fieldErrors?.[`pages.${path}.seoTitle`]}
              />
              <TextField
                id={`${key}MetaDescription`}
                name={`${key}MetaDescription`}
                label="Meta description"
                defaultValue={description}
                guide={DESCRIPTION_GUIDE_LENGTH}
                max={DESCRIPTION_MAX_LENGTH}
                multiline
                error={state.fieldErrors?.[`pages.${path}.metaDescription`]}
              />
              <TextField
                id={`${key}OgTitle`}
                name={`${key}OgTitle`}
                label="OG title override"
                defaultValue={page?.ogTitle ?? ""}
                guide={TITLE_GUIDE_LENGTH}
                max={TITLE_MAX_LENGTH}
                error={state.fieldErrors?.[`pages.${path}.ogTitle`]}
              />
              <TextField
                id={`${key}OgDescription`}
                name={`${key}OgDescription`}
                label="OG description override"
                defaultValue={page?.ogDescription ?? ""}
                guide={DESCRIPTION_GUIDE_LENGTH}
                max={DESCRIPTION_MAX_LENGTH}
                multiline
                error={state.fieldErrors?.[`pages.${path}.ogDescription`]}
              />
              <div className="flex flex-col gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`${key}OgImagePath`}
                >
                  OG image override
                </label>
                <input
                  id={`${key}OgImagePath`}
                  name={`${key}OgImagePath`}
                  defaultValue={page?.ogImagePath ?? ""}
                  className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
                />
                {fieldError(state.fieldErrors, `pages.${path}.ogImagePath`)}
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`${key}Index`}
                    defaultChecked={page?.index ?? true}
                    className="size-4"
                  />
                  Allow indexing
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`${key}Follow`}
                    defaultChecked={page?.follow ?? true}
                    className="size-4"
                  />
                  Follow links
                </label>
              </div>
            </fieldset>
          );
        })}
      </section>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-staff-muted" role="status">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Saving…" : "Save SEO settings"}
      </button>
    </form>
  );
}
