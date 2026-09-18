"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { ContactTurnstile } from "@/app/(marketing)/components/contact-turnstile";
import { submitMarketingContactAction } from "@/app/(marketing)/%5Fmarketing/contact/actions";
import {
  initialContactActionState,
  type ContactActionState,
} from "@/app/(marketing)/%5Fmarketing/contact/state";
import { MarketingPrimaryButton } from "@/app/(marketing)/components/marketing-primary-button";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import {
  CONTACT_FIELD_LIMITS,
  CONTACT_HONEYPOT_FIELD,
  readContactFormValues,
  validateContactFormValues,
  type ContactEnquiryField,
  type ContactEnquiryFieldErrors,
} from "@/lib/marketing/contact-fields";

import styles from "../marketing.module.css";

const FIELD_ORDER: ContactEnquiryField[] = [
  "fullName",
  "workEmail",
  "clinicName",
  "phone",
  "message",
];

function fieldErrorsFromState(
  state: ContactActionState
): ContactEnquiryFieldErrors {
  return state.status === "error" ? state.fieldErrors : {};
}

export function ContactForm({
  demoHref,
  turnstileSiteKey,
}: {
  demoHref: string;
  turnstileSiteKey: string;
}) {
  const formId = useId().replace(/:/g, "");
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(
    submitMarketingContactAction,
    initialContactActionState
  );
  const [clientErrors, setClientErrors] = useState<ContactEnquiryFieldErrors>(
    {}
  );
  const [turnstileReset, setTurnstileReset] = useState(0);
  const fieldErrors = {
    ...fieldErrorsFromState(state),
    ...clientErrors,
  };
  const formError =
    state.status === "error" && Object.keys(clientErrors).length === 0
      ? state.error
      : Object.keys(clientErrors).length > 0
        ? "Please review the highlighted fields."
        : null;

  useEffect(() => {
    if (state.status === "success") {
      successRef.current?.focus();
      return;
    }

    if (state.status !== "error") {
      return;
    }

    setTurnstileReset((value) => value + 1);

    const errors = {
      ...fieldErrorsFromState(state),
      ...clientErrors,
    };
    const firstField = FIELD_ORDER.find((field) => errors[field]);
    if (firstField) {
      const node = formRef.current?.elements.namedItem(firstField);
      if (node instanceof HTMLElement) {
        node.focus();
        return;
      }
    }

    summaryRef.current?.focus();
  }, [state, clientErrors]);

  function validateClient(formData: FormData): ContactEnquiryFieldErrors {
    return validateContactFormValues(readContactFormValues(formData));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const errors = validateClient(new FormData(event.currentTarget));
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      const firstField = FIELD_ORDER.find((field) => errors[field]);
      if (!firstField) {
        return;
      }
      const node = event.currentTarget.elements.namedItem(firstField);
      if (node instanceof HTMLElement) {
        node.focus();
      }
    }
  }

  if (state.status === "success") {
    return (
      <div
        ref={successRef}
        className={`${styles.contactFormPanel} ${styles.contactSuccess}`}
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        <h2 id="contact-form-heading" className={styles.contactSuccessTitle}>
          Thanks — your message has been sent.
        </h2>
        <p className={styles.copy}>
          We&apos;ll reply to the email address you provided.
        </p>
        <div className={styles.actions}>
          <MarketingPrimaryLink href="/">Homepage</MarketingPrimaryLink>
          <a className={`${styles.button} ${styles.secondary}`} href={demoHref}>
            Dental demo
          </a>
          <Link
            className={`${styles.button} ${styles.secondary}`}
            href="/pricing"
          >
            Pricing
          </Link>
        </div>
      </div>
    );
  }

  const summaryId = `${formId}-summary`;

  return (
    <form
      ref={formRef}
      className={`${styles.contactFormPanel} ${styles.contactForm}`}
      action={formAction}
      noValidate
      onSubmit={handleSubmit}
      aria-describedby={formError ? summaryId : undefined}
    >
      <h2 id="contact-form-heading" className={styles.contactFormTitle}>
        Request a demo
      </h2>
      {formError ? (
        <div
          ref={summaryRef}
          id={summaryId}
          className={styles.contactErrorSummary}
          tabIndex={-1}
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      <div className={styles.contactFormRow}>
        <ContactField
          id={`${formId}-name`}
          label="Full name"
          error={fieldErrors.fullName}
        >
          <input
            id={`${formId}-name`}
            className={styles.contactControl}
            name="fullName"
            type="text"
            autoComplete="name"
            required
            maxLength={CONTACT_FIELD_LIMITS.fullName}
            aria-invalid={fieldErrors.fullName ? true : undefined}
            aria-describedby={
              fieldErrors.fullName ? `${formId}-name-error` : undefined
            }
          />
        </ContactField>
        <ContactField
          id={`${formId}-email`}
          label="Email"
          error={fieldErrors.workEmail}
        >
          <input
            id={`${formId}-email`}
            className={styles.contactControl}
            name="workEmail"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            maxLength={CONTACT_FIELD_LIMITS.workEmail}
            aria-invalid={fieldErrors.workEmail ? true : undefined}
            aria-describedby={
              fieldErrors.workEmail ? `${formId}-email-error` : undefined
            }
          />
        </ContactField>
      </div>

      <ContactField
        id={`${formId}-clinic`}
        label="Practice / clinic name"
        error={fieldErrors.clinicName}
      >
        <input
          id={`${formId}-clinic`}
          className={styles.contactControl}
          name="clinicName"
          type="text"
          autoComplete="organization"
          required
          maxLength={CONTACT_FIELD_LIMITS.clinicName}
          aria-invalid={fieldErrors.clinicName ? true : undefined}
          aria-describedby={
            fieldErrors.clinicName ? `${formId}-clinic-error` : undefined
          }
        />
      </ContactField>

      <ContactField
        id={`${formId}-phone`}
        label="Phone"
        optional
        error={fieldErrors.phone}
      >
        <input
          id={`${formId}-phone`}
          className={styles.contactControl}
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={CONTACT_FIELD_LIMITS.phone}
          aria-invalid={fieldErrors.phone ? true : undefined}
          aria-describedby={
            fieldErrors.phone ? `${formId}-phone-error` : undefined
          }
        />
      </ContactField>

      <ContactField
        id={`${formId}-message`}
        label="Anything you'd like us to know?"
        optional
        error={fieldErrors.message}
      >
        <textarea
          id={`${formId}-message`}
          className={styles.contactControl}
          name="message"
          rows={5}
          maxLength={CONTACT_FIELD_LIMITS.message}
          aria-invalid={fieldErrors.message ? true : undefined}
          aria-describedby={
            fieldErrors.message ? `${formId}-message-error` : undefined
          }
        />
      </ContactField>

      <div className={styles.contactHoneypot} aria-hidden="true">
        <label htmlFor={`${formId}-website`}>Website</label>
        <input
          id={`${formId}-website`}
          name={CONTACT_HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <ContactTurnstile
        siteKey={turnstileSiteKey}
        resetSignal={turnstileReset}
      />

      <p className={styles.contactPrivacy}>
        Do not include patient, medical or sensitive health information. This
        form is for product, demo and business enquiries — not patient support,
        clinical advice or emergencies.
      </p>

      <div className={styles.contactActions}>
        <MarketingPrimaryButton type="submit" busy={pending}>
          Send enquiry
        </MarketingPrimaryButton>
      </div>
    </form>
  );
}

function ContactField({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.contactField}>
      <label htmlFor={id}>
        {label}
        {optional ? (
          <span className={styles.contactOptional}> (optional)</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.contactFieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
