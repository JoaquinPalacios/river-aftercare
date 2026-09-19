"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ColorField } from "@/app/(staff)/components/color-field";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { SaveStatus } from "@/app/(staff)/components/save-status";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import { PracticeLogoField } from "@/app/(staff)/(clinic-portal)/practice/practice-logo-field";
import {
  savePracticeSettingsAction,
  type PracticeActionState,
} from "@/app/(staff)/(clinic-portal)/practice/actions";
import { formSaveStatus } from "@/lib/clinic-portal/form-save-status";
import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";
import { CLINIC_TYPEFACE_OPTIONS } from "@/lib/branding/clinic-typeface";

const initial: PracticeActionState = {};

const SECTIONS = [
  { id: "practice-identity", label: "Identity" },
  { id: "practice-branding", label: "Branding" },
  { id: "practice-contact", label: "Contact" },
  { id: "practice-emergency", label: "Emergency" },
  { id: "practice-presentation", label: "Presentation" },
] as const;

function snapshot(values: PracticeSettingsInput): string {
  return JSON.stringify(values);
}

function scrollToSection(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
    inline: "nearest",
  });
}

export function PracticeSettingsForm({
  values,
  logoSrc,
  canEdit,
  patientSiteHref,
  storageAvailable,
}: {
  values: PracticeSettingsInput;
  logoSrc: string | null;
  canEdit: boolean;
  patientSiteHref: string | null;
  storageAvailable: boolean;
}) {
  const pendingSnapshot = useRef(snapshot(values));
  const [state, action, pending] = useActionState(
    savePracticeSettingsAction,
    initial
  );
  const [form, setForm] = useState(values);
  const [currentLogoSrc, setCurrentLogoSrc] = useState(logoSrc);
  const [confirmed, setConfirmed] = useState(() => snapshot(values));
  const [activeSection, setActiveSection] = useState<
    (typeof SECTIONS)[number]["id"]
  >(SECTIONS[0].id);
  const serialized = useMemo(() => snapshot(form), [form]);
  const dirty = serialized !== confirmed;
  const saveStatus = formSaveStatus({ dirty, pending });
  const { open, keepEditing, discard } = useUnsavedChangesGuard(dirty);

  const onLogoChange = useCallback(
    (nextLogo: { logoUrl: string | null; logoSrc: string | null }) => {
      setCurrentLogoSrc(nextLogo.logoSrc);
      setForm((current) => {
        const next = { ...current, logoUrl: nextLogo.logoUrl };
        setConfirmed(snapshot(next));
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (state.saved) {
      setConfirmed(pendingSnapshot.current);
    }
  }, [state]);

  useEffect(() => {
    if (!state.fieldErrors && !state.error) {
      return;
    }
    const first = document.querySelector<HTMLElement>(
      "form [aria-invalid='true']"
    );
    if (first) {
      first.focus();
      return;
    }
    document.querySelector<HTMLElement>("[role='alert']")?.focus();
  }, [state]);

  useEffect(() => {
    const nodes = SECTIONS.map((section) =>
      document.getElementById(section.id)
    ).filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted(
            (left, right) => right.intersectionRatio - left.intersectionRatio
          )[0];
        if (visible?.target.id) {
          setActiveSection(
            visible.target.id as (typeof SECTIONS)[number]["id"]
          );
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.15, 0.35, 0.6],
      }
    );

    for (const node of nodes) {
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, []);

  function patch<K extends keyof PracticeSettingsInput>(
    key: K,
    value: PracticeSettingsInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="staffEditorPage lg:grid lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav
        aria-label="Practice sections"
        className="mb-6 hidden lg:sticky lg:top-4 lg:mb-0 lg:block"
      >
        <ul className="staffNavGroup">
          {SECTIONS.map((section) => {
            const current = activeSection === section.id;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={current ? "true" : undefined}
                  className="staffNavRow staffSectionNavRow"
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection(section.id);
                    setActiveSection(section.id);
                  }}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        action={action}
        className="staffPracticeForm"
        onSubmit={() => {
          pendingSnapshot.current = serialized;
        }}
      >
        <div className="staffPracticeSave sticky top-0 z-20 bg-staff-canvas py-2">
          <SaveStatus
            status={saveStatus}
            error={state.error}
            success={
              state.saved && !dirty
                ? "Practice settings saved. The patient site uses these values."
                : undefined
            }
          />
          {canEdit ? (
            <button
              type="submit"
              disabled={pending}
              className="staffBtn staffBtnPrimary hidden sm:inline-flex"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          ) : (
            <p className="text-sm text-staff-muted">
              Staff can view practice settings but cannot change them.
            </p>
          )}
        </div>

        <section id="practice-identity" className="staffPracticeSection">
          <h2 className="text-base font-semibold">Practice identity</h2>
          <Field label="Display name" htmlFor="displayName">
            <input
              id="displayName"
              name="displayName"
              data-practice-field
              value={form.displayName}
              onChange={(event) => patch("displayName", event.target.value)}
              disabled={!canEdit}
              aria-invalid={state.fieldErrors?.displayName ? "true" : "false"}
              className="staffField"
            />
            <FieldError message={state.fieldErrors?.displayName} />
          </Field>
          <PracticeLogoField
            displayName={form.displayName}
            logoUrl={form.logoUrl}
            logoSrc={currentLogoSrc}
            canEdit={canEdit}
            storageAvailable={storageAvailable}
            onLogoChange={onLogoChange}
          />
        </section>

        <section id="practice-branding" className="staffPracticeSection">
          <h2 className="text-base font-semibold">Branding</h2>
          <ColorField
            id="primaryColor"
            name="primaryColor"
            label="Primary brand colour"
            hint="Shown on the patient site"
            value={form.primaryColor ?? ""}
            disabled={!canEdit}
            error={state.fieldErrors?.primaryColor}
            onChange={(value) => patch("primaryColor", value || null)}
          />
          <ColorField
            id="accentColor"
            name="accentColor"
            label="Accent colour"
            value={form.accentColor ?? ""}
            disabled={!canEdit}
            error={state.fieldErrors?.accentColor}
            onChange={(value) => patch("accentColor", value || null)}
          />
          <ColorField
            id="neutralColor"
            name="neutralColor"
            label="Neutral / surface tone"
            value={form.neutralColor ?? ""}
            disabled={!canEdit}
            error={state.fieldErrors?.neutralColor}
            onChange={(value) => patch("neutralColor", value || null)}
          />
          <Field label="Corner radius" htmlFor="radiusPreset">
            <select
              id="radiusPreset"
              name="radiusPreset"
              value={form.radiusPreset}
              onChange={(event) =>
                patch(
                  "radiusPreset",
                  event.target.value as PracticeSettingsInput["radiusPreset"]
                )
              }
              disabled={!canEdit}
              className="staffSelect"
            >
              <option value="SHARP">Sharp</option>
              <option value="MEDIUM">Medium</option>
              <option value="SOFT">Soft</option>
            </select>
          </Field>
          <Field label="Patient typeface" htmlFor="typeface">
            <select
              id="typeface"
              name="typeface"
              value={form.typeface ?? ""}
              onChange={(event) =>
                patch(
                  "typeface",
                  (event.target.value ||
                    null) as PracticeSettingsInput["typeface"]
                )
              }
              disabled={!canEdit}
              className="staffSelect"
            >
              <option value="">River Aftercare default</option>
              {CLINIC_TYPEFACE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-staff-muted">
              Applies to patient-facing aftercare pages. Staff and marketing
              screens keep the River Aftercare typeface.
            </p>
          </Field>
          <Field label="Patient terminology" htmlFor="instructionTerminology">
            <select
              id="instructionTerminology"
              name="instructionTerminology"
              value={form.instructionTerminology}
              onChange={(event) =>
                patch(
                  "instructionTerminology",
                  event.target
                    .value as PracticeSettingsInput["instructionTerminology"]
                )
              }
              disabled={!canEdit}
              className="staffSelect"
            >
              <option value="AFTERCARE">Aftercare instructions</option>
              <option value="POST_TREATMENT">
                Post-treatment instructions
              </option>
              <option value="POST_PROCEDURE">
                Post-procedure instructions
              </option>
              <option value="POST_OPERATIVE">
                Post-operative instructions
              </option>
              <option value="RECOVERY">Recovery instructions</option>
            </select>
          </Field>
        </section>

        <section id="practice-contact" className="staffPracticeSection">
          <h2 className="text-base font-semibold">Contact</h2>
          <Field label="Clinic phone" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              data-practice-field
              value={form.phone ?? ""}
              onChange={(event) => patch("phone", event.target.value || null)}
              disabled={!canEdit}
              aria-invalid={state.fieldErrors?.phone ? "true" : "false"}
              className="staffField staffFieldNarrow"
            />
            <FieldError message={state.fieldErrors?.phone} />
          </Field>
          <Field label="Contact page URL" htmlFor="contactUrl">
            <input
              id="contactUrl"
              name="contactUrl"
              data-practice-field
              value={form.contactUrl ?? ""}
              onChange={(event) =>
                patch("contactUrl", event.target.value || null)
              }
              disabled={!canEdit}
              aria-invalid={state.fieldErrors?.contactUrl ? "true" : "false"}
              className="staffField"
            />
            <FieldError message={state.fieldErrors?.contactUrl} />
          </Field>
          <Field label="Address line 1" htmlFor="addressLine1">
            <input
              id="addressLine1"
              name="addressLine1"
              value={form.addressLine1 ?? ""}
              onChange={(event) =>
                patch("addressLine1", event.target.value || null)
              }
              disabled={!canEdit}
              className="staffField"
            />
          </Field>
          <Field label="Address line 2" htmlFor="addressLine2">
            <input
              id="addressLine2"
              name="addressLine2"
              value={form.addressLine2 ?? ""}
              onChange={(event) =>
                patch("addressLine2", event.target.value || null)
              }
              disabled={!canEdit}
              className="staffField"
            />
          </Field>
          <div className="staffPracticeGrid3">
            <Field label="City" htmlFor="city">
              <input
                id="city"
                name="city"
                value={form.city ?? ""}
                onChange={(event) => patch("city", event.target.value || null)}
                disabled={!canEdit}
                className="staffField"
              />
            </Field>
            <Field label="Region" htmlFor="region">
              <input
                id="region"
                name="region"
                value={form.region ?? ""}
                onChange={(event) =>
                  patch("region", event.target.value || null)
                }
                disabled={!canEdit}
                className="staffField"
              />
            </Field>
            <Field label="Postal code" htmlFor="postalCode">
              <input
                id="postalCode"
                name="postalCode"
                value={form.postalCode ?? ""}
                onChange={(event) =>
                  patch("postalCode", event.target.value || null)
                }
                disabled={!canEdit}
                className="staffField staffFieldNarrow"
              />
            </Field>
          </div>
        </section>

        <section id="practice-emergency" className="staffPracticeSection">
          <h2 className="text-base font-semibold">Emergency / urgent help</h2>
          <Field label="Emergency instructions" htmlFor="emergencyInstructions">
            <textarea
              id="emergencyInstructions"
              name="emergencyInstructions"
              data-practice-field
              value={form.emergencyInstructions ?? ""}
              onChange={(event) =>
                patch("emergencyInstructions", event.target.value || null)
              }
              disabled={!canEdit}
              rows={5}
              aria-invalid={
                state.fieldErrors?.emergencyInstructions ? "true" : "false"
              }
              className="staffField"
            />
            <FieldError message={state.fieldErrors?.emergencyInstructions} />
          </Field>
        </section>

        <section id="practice-presentation" className="staffPracticeSection">
          <h2 className="text-base font-semibold">Patient presentation</h2>
          <Field label="Default appearance" htmlFor="themeMode">
            <select
              id="themeMode"
              name="themeMode"
              value={form.themeMode}
              onChange={(event) =>
                patch(
                  "themeMode",
                  event.target.value as PracticeSettingsInput["themeMode"]
                )
              }
              disabled={!canEdit}
              className="staffSelect"
            >
              <option value="SYSTEM">System</option>
              <option value="LIGHT">Light</option>
              <option value="DARK">Dark</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowPatientThemeToggle"
              checked={form.allowPatientThemeToggle}
              onChange={(event) =>
                patch("allowPatientThemeToggle", event.target.checked)
              }
              disabled={!canEdit}
              className="h-4 w-4"
            />
            Allow patients to toggle light and dark
          </label>
          <p className="text-sm text-staff-muted">
            This controls the patient aftercare site. It does not change the
            staff portal appearance.
          </p>
          {patientSiteHref ? (
            <a
              href={patientSiteHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-staff-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff-brand"
            >
              View patient site
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLinkIcon />
            </a>
          ) : null}
        </section>

        {canEdit ? (
          <div className="staffEditorActionsMobile">
            <button
              type="submit"
              disabled={pending}
              className="staffBtn staffBtnPrimary flex-1"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={open}
        title="Discard unsaved changes?"
        description="Your latest changes haven't been saved."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        confirmTone="danger"
        onCancel={keepEditing}
        onConfirm={discard}
      />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-sm text-red-600">{message}</p>;
}
