"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import {
  loginSchema,
  type LoginFormValues,
} from "@/app/(staff)/login/login-schema";
import { startAppNavigation } from "@/lib/navigation-progress";

interface LoginFormErrors {
  email?: string;
  password?: string;
  form?: string;
}

const initialValues: LoginFormValues = {
  email: "",
  password: "",
};

const PENDING_STATUS = "Signing in. Please wait.";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const pending = isSubmitting || isPending;

  function updateField<K extends keyof LoginFormValues>(
    field: K,
    value: LoginFormValues[K]
  ) {
    if (submittingRef.current) {
      return;
    }

    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const parsedValues = loginSchema.safeParse(values);

    if (!parsedValues.success) {
      const fieldErrors = parsedValues.error.flatten().fieldErrors;

      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });

      return;
    }

    setErrors({});
    submittingRef.current = true;
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsedValues.data),
        });

        if (response.ok) {
          const data = (await response.json()) as { redirectTo?: string };
          const redirectTo = data.redirectTo || "/dashboard";
          startAppNavigation(redirectTo);
          router.push(redirectTo);
          router.refresh();
          return;
        }

        let errorMessage = "Unable to sign in right now. Try again.";

        try {
          const data = (await response.json()) as { error?: string };

          if (response.status === 401) {
            errorMessage = "Invalid email or password.";
          } else if (response.status === 400) {
            errorMessage = data.error || "Enter your email and password.";
          } else if (response.status === 403 || response.status === 409) {
            errorMessage =
              data.error ||
              "Your account cannot access the staff dashboard yet.";
          }
        } catch {
          if (response.status === 401) {
            errorMessage = "Invalid email or password.";
          }
        }

        submittingRef.current = false;
        setIsSubmitting(false);
        setErrors({ form: errorMessage });
      } catch {
        submittingRef.current = false;
        setIsSubmitting(false);
        setErrors({ form: "Unable to sign in right now. Try again." });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      method="post"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending || undefined}
    >
      <div
        id="login-pending-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {pending ? PENDING_STATUS : ""}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-staff-ink" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          disabled={pending}
          onChange={(event) => updateField("email", event.target.value)}
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="staffLoginField"
        />
        {errors.email ? (
          <p id="email-error" className="staffFieldError">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="password"
        >
          Password
        </label>
        <PasswordVisibilityField
          value={values.password}
          onChange={(value) => updateField("password", value)}
          invalid={Boolean(errors.password)}
          errorId={errors.password ? "password-error" : undefined}
          disabled={pending}
        />
        {errors.password ? (
          <p id="password-error" className="staffFieldError">
            {errors.password}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <div id="login-form-error" className="staffFormAlert" role="alert">
          {errors.form}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11"
      >
        {pending ? (
          <span className="staffLoginSpinner" aria-hidden="true" />
        ) : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-staff-muted">
        <a href="/forgot-password" className="font-medium text-staff-brand">
          Forgot password?
        </a>
      </p>
    </form>
  );
}
