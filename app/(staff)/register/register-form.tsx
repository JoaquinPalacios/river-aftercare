"use client";

import { useRef, useState, useTransition } from "react";

import { ContactTurnstile } from "@/app/(marketing)/components/contact-turnstile";
import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import { ServiceCategoryFields } from "@/app/(staff)/(clinic-portal)/practice/sites/service-category-fields";
import {
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";
import {
  PROFILE_NAME_HTML_MESSAGE,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_NAME_MAX_MESSAGE,
  PROFILE_NAME_REQUIRED_MESSAGE,
} from "@/lib/auth/account-profile-fields";
import { staffEmailFieldError } from "@/lib/auth/login-input";
import { newPasswordFieldErrors } from "@/lib/auth/password-policy";
import {
  REGISTRATION_CATEGORY_REQUIRED_MESSAGE,
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTERVAL_MESSAGE,
  REGISTRATION_PLAN_MESSAGE,
  REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE,
  REGISTRATION_TERMS_REQUIRED_MESSAGE,
  registrationSlugPolicyMessage,
} from "@/lib/auth/registration-copy";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-fields";
import { formatAudInclGst, PLAN_PRICES } from "@/lib/marketing/plans";

const PENDING_STATUS = "Sending verification instructions. Please wait.";

type FieldErrors = Partial<
  Record<
    | "practiceName"
    | "serviceCategories"
    | "slug"
    | "ownerName"
    | "email"
    | "password"
    | "confirmPassword"
    | "commercialPlan"
    | "billingInterval"
    | "termsAccepted",
    string
  >
>;

function clientFieldErrors(values: {
  practiceName: string;
  categories: ServiceCategory[];
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  confirmPassword: string;
  plan: string;
  interval: string;
  termsAccepted: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.practiceName.trim()) {
    errors.practiceName = REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE;
  }
  if (values.categories.length === 0) {
    errors.serviceCategories = REGISTRATION_CATEGORY_REQUIRED_MESSAGE;
  }
  const slugMessage = registrationSlugPolicyMessage(values.slug);
  if (slugMessage) {
    errors.slug = slugMessage;
  }
  const ownerError = ownerNameError(values.ownerName);
  if (ownerError) {
    errors.ownerName = ownerError;
  }
  const emailError = staffEmailFieldError(values.email);
  if (emailError) {
    errors.email = emailError;
  }
  const passwordErrors = newPasswordFieldErrors(
    values.password,
    values.confirmPassword
  );
  if (passwordErrors.newPassword) {
    errors.password = passwordErrors.newPassword;
  }
  if (passwordErrors.confirmPassword) {
    errors.confirmPassword = passwordErrors.confirmPassword;
  }
  if (values.plan !== "ESSENTIAL" && values.plan !== "PRACTICE") {
    errors.commercialPlan = REGISTRATION_PLAN_MESSAGE;
  }
  if (values.interval !== "MONTHLY" && values.interval !== "YEARLY") {
    errors.billingInterval = REGISTRATION_INTERVAL_MESSAGE;
  }
  if (!values.termsAccepted) {
    errors.termsAccepted = REGISTRATION_TERMS_REQUIRED_MESSAGE;
  }
  return errors;
}

export function RegisterForm({
  turnstileSiteKey,
  trialDisclosure,
  termsHref,
  privacyHref,
  slugHost,
}: {
  turnstileSiteKey: string;
  trialDisclosure: string;
  termsHref: string;
  privacyHref: string;
  slugHost: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [practiceName, setPracticeName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [plan, setPlan] = useState<"ESSENTIAL" | "PRACTICE" | "">("ESSENTIAL");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY" | "">(
    "MONTHLY"
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const pending = isSubmitting || isPending;

  function updatePracticeName(next: string) {
    setPracticeName(next);
    if (!slugEdited) {
      setSlug(suggestGuideSlug(next));
    }
  }

  function toggleCategory(category: ServiceCategory, checked: boolean) {
    setCategories((current) =>
      checked
        ? current.includes(category)
          ? current
          : [...current, category]
        : current.filter((item) => item !== category)
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !formRef.current) {
      return;
    }

    const nextErrors = clientFieldErrors({
      practiceName,
      categories,
      slug,
      ownerName,
      email,
      password,
      confirmPassword,
      plan,
      interval,
      termsAccepted,
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitted(false);
      focusFirstRegistrationError(formRef.current, nextErrors);
      return;
    }

    setErrors({});
    setFormError(undefined);
    submittingRef.current = true;
    setIsSubmitting(true);
    const body = new FormData(formRef.current);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          body,
        });
        if (response.ok) {
          setSubmitted(true);
          return;
        }
        if (response.status === 400) {
          try {
            const data = (await response.json()) as {
              error?: string;
              fieldErrors?: FieldErrors;
            };
            setErrors(data.fieldErrors ?? {});
            setFormError(data.error);
          } catch {
            setFormError("Check the form and try again.");
          }
          return;
        }
        setSubmitted(true);
      } catch {
        setSubmitted(true);
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  const priceLabel = (amount: number) => formatAudInclGst(amount);
  const selectedMonthly =
    plan === "PRACTICE"
      ? PLAN_PRICES.practice.monthlyAudInclGst
      : PLAN_PRICES.essential.monthlyAudInclGst;
  const selectedAnnual =
    plan === "PRACTICE"
      ? PLAN_PRICES.practice.annualAudInclGst
      : PLAN_PRICES.essential.annualAudInclGst;

  if (submitted) {
    return (
      <div
        className="rounded-md border border-staff-line bg-staff-canvas px-3 py-3 text-sm leading-6 text-staff-ink"
        role="status"
      >
        {REGISTRATION_INTENT_GENERIC_MESSAGE}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-5"
      method="post"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending || undefined}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {pending ? PENDING_STATUS : ""}
      </div>

      <p className="rounded-md border border-staff-line bg-staff-canvas px-3 py-3 text-sm leading-6 text-staff-ink">
        {trialDisclosure} {plan === "PRACTICE" ? "Practice" : "Essential"} is{" "}
        {priceLabel(selectedMonthly)} per month or {priceLabel(selectedAnnual)}{" "}
        per year after the trial. Annual billing is 12 months for the price of
        10.
      </p>

      <Field
        id="practiceName"
        label="Practice name"
        error={errors.practiceName}
      >
        <input
          id="practiceName"
          name="practiceName"
          value={practiceName}
          disabled={pending}
          autoComplete="organization"
          onChange={(event) => updatePracticeName(event.target.value)}
          aria-invalid={errors.practiceName ? "true" : "false"}
          aria-describedby={
            errors.practiceName ? "practiceName-error" : undefined
          }
          className="staffLoginField"
        />
      </Field>

      <div>
        <ServiceCategoryFields
          selected={categories}
          disabled={pending}
          legend="Practice type"
          description="Choose every type of care this practice provides."
          error={errors.serviceCategories}
          onToggle={toggleCategory}
        />
        <p className="sr-only">
          {categories
            .map((category) => SERVICE_CATEGORY_LABELS[category])
            .join(", ")}
        </p>
      </div>

      <Field
        id="slug"
        label="Preferred clinic URL"
        error={errors.slug}
        hint={errors.slug ? undefined : `${slug || "your-clinic"}.${slugHost}`}
      >
        <input
          id="slug"
          name="slug"
          value={slug}
          disabled={pending}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value.trim().toLowerCase());
          }}
          aria-invalid={errors.slug ? "true" : "false"}
          aria-describedby={errors.slug ? "slug-error" : "slug-hint"}
          className="staffLoginField"
        />
      </Field>

      <Field id="ownerName" label="Your full name" error={errors.ownerName}>
        <input
          id="ownerName"
          name="ownerName"
          value={ownerName}
          disabled={pending}
          autoComplete="name"
          onChange={(event) => setOwnerName(event.target.value)}
          aria-invalid={errors.ownerName ? "true" : "false"}
          aria-describedby={errors.ownerName ? "ownerName-error" : undefined}
          className="staffLoginField"
        />
      </Field>

      <Field id="email" label="Email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          disabled={pending}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="staffLoginField"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="password"
        >
          Password
        </label>
        <PasswordVisibilityField
          id="password"
          name="password"
          autoComplete="new-password"
          value={password}
          disabled={pending}
          invalid={Boolean(errors.password)}
          errorId={errors.password ? "password-error" : undefined}
          describedBy="password-hint"
          onChange={setPassword}
        />
        <p id="password-hint" className="text-sm text-staff-muted">
          Use at least 12 characters.
        </p>
        {errors.password ? (
          <p id="password-error" className="staffFieldError">
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="confirmPassword"
        >
          Confirm password
        </label>
        <PasswordVisibilityField
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={pending}
          invalid={Boolean(errors.confirmPassword)}
          errorId={errors.confirmPassword ? "confirmPassword-error" : undefined}
          onChange={setConfirmPassword}
        />
        {errors.confirmPassword ? (
          <p id="confirmPassword-error" className="staffFieldError">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2" disabled={pending}>
        <legend className="text-sm font-medium text-staff-ink">Plan</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <PlanChoice
            name="commercialPlan"
            value="ESSENTIAL"
            checked={plan === "ESSENTIAL"}
            onChange={() => setPlan("ESSENTIAL")}
            title="Essential"
            detail={`${priceLabel(PLAN_PRICES.essential.monthlyAudInclGst)} per month, or ${priceLabel(PLAN_PRICES.essential.annualAudInclGst)} per year`}
          />
          <PlanChoice
            name="commercialPlan"
            value="PRACTICE"
            checked={plan === "PRACTICE"}
            onChange={() => setPlan("PRACTICE")}
            title="Practice"
            detail={`${priceLabel(PLAN_PRICES.practice.monthlyAudInclGst)} per month, or ${priceLabel(PLAN_PRICES.practice.annualAudInclGst)} per year`}
          />
        </div>
        {errors.commercialPlan ? (
          <p id="commercialPlan-error" className="staffFieldError">
            {errors.commercialPlan}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2" disabled={pending}>
        <legend className="text-sm font-medium text-staff-ink">Billing</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <PlanChoice
            name="billingInterval"
            value="MONTHLY"
            checked={interval === "MONTHLY"}
            onChange={() => setInterval("MONTHLY")}
            title="Monthly"
            detail="Billed each month after the trial."
          />
          <PlanChoice
            name="billingInterval"
            value="YEARLY"
            checked={interval === "YEARLY"}
            onChange={() => setInterval("YEARLY")}
            title="Annual"
            detail="12 months for the price of 10, billed after the trial."
          />
        </div>
        {errors.billingInterval ? (
          <p className="staffFieldError">{errors.billingInterval}</p>
        ) : null}
      </fieldset>

      <div className="flex items-start gap-3">
        <input
          id="termsAccepted"
          name="termsAccepted"
          type="checkbox"
          value="on"
          checked={termsAccepted}
          disabled={pending}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          aria-invalid={errors.termsAccepted ? "true" : "false"}
          aria-describedby={
            errors.termsAccepted ? "termsAccepted-error" : undefined
          }
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--staff-brand)]"
        />
        <label
          htmlFor="termsAccepted"
          className="text-sm leading-6 text-staff-ink"
        >
          I agree to the{" "}
          <a
            href={termsHref}
            className="font-medium text-staff-brand underline underline-offset-2"
          >
            Terms & Conditions
          </a>{" "}
          and acknowledge the{" "}
          <a
            href={privacyHref}
            className="font-medium text-staff-brand underline underline-offset-2"
          >
            Privacy Policy
          </a>
          .
        </label>
      </div>
      {errors.termsAccepted ? (
        <p id="termsAccepted-error" className="staffFieldError">
          {errors.termsAccepted}
        </p>
      ) : null}

      <div className="sr-only" aria-hidden="true">
        <label htmlFor="registration-website">Website</label>
        <input
          id="registration-website"
          name={CONTACT_HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <ContactTurnstile siteKey={turnstileSiteKey} resetSignal={0} />

      {formError ? (
        <div className="staffFormAlert" role="alert">
          {formError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11"
      >
        {pending ? "Sending…" : "Create registration"}
      </button>
    </form>
  );
}

const REGISTRATION_FIELD_ORDER = [
  "practiceName",
  "serviceCategories",
  "slug",
  "ownerName",
  "email",
  "password",
  "confirmPassword",
  "commercialPlan",
  "billingInterval",
  "termsAccepted",
] as const;

function focusFirstRegistrationError(
  form: HTMLFormElement,
  errors: FieldErrors
) {
  const field = REGISTRATION_FIELD_ORDER.find((name) => errors[name]);
  if (!field) {
    return;
  }
  if (field === "serviceCategories") {
    const checkbox = form.querySelector<HTMLInputElement>(
      'input[name="serviceCategories"]'
    );
    checkbox?.focus();
    return;
  }
  const node = form.elements.namedItem(field);
  if (node instanceof HTMLElement) {
    node.focus();
  }
}

function ownerNameError(name: string): string | null {
  const trimmed = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return PROFILE_NAME_REQUIRED_MESSAGE;
  }
  if (/[<>]/.test(trimmed)) {
    return PROFILE_NAME_HTML_MESSAGE;
  }
  if (trimmed.length > PROFILE_NAME_MAX_LENGTH) {
    return PROFILE_NAME_MAX_MESSAGE;
  }
  return null;
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-staff-ink" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-staff-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="staffFieldError">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PlanChoice({
  name,
  value,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-staff-line px-3 py-3 text-sm">
      <input
        className="mt-1"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span>
        <span className="block font-medium text-staff-ink">{title}</span>
        <span className="mt-1 block leading-5 text-staff-muted">{detail}</span>
      </span>
    </label>
  );
}
