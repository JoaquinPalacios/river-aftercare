"use client";

import { useActionState, useState, type FormEvent } from "react";

import {
  submitHelpFeedbackAction,
  type HelpFeedbackActionState,
} from "@/app/(staff)/account/help/actions";
import { PendingSubmitButton } from "@/app/(staff)/components/pending-submit-button";
import {
  HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT,
  HELP_FEEDBACK_IMPORTANCE,
  HELP_FEEDBACK_IMPORTANCE_LABELS,
  HELP_FEEDBACK_LIMITS,
  HELP_FEEDBACK_REVIEW_FIELDS,
  HELP_FEEDBACK_SENT_MESSAGE,
  helpFeedbackClientFieldErrors,
  readHelpFeedbackForm,
  type HelpFeedbackCategory,
  type HelpFeedbackFieldErrors,
  type HelpFeedbackImportance,
} from "@/lib/support/help-feedback-fields";

const initialHelpFeedbackActionState: HelpFeedbackActionState = {
  status: "idle",
};

const OPTIONS: Array<{
  id: HelpFeedbackCategory;
  title: string;
  description: string;
}> = [
  {
    id: "problem",
    title: "Report a problem",
    description: "Tell us what went wrong.",
  },
  {
    id: "question",
    title: "Ask a question",
    description: "Ask the River Aftercare team.",
  },
  {
    id: "feature",
    title: "Suggest a feature",
    description: "Describe what your clinic needs.",
  },
];

export function HelpFeedbackForm({
  originPath,
}: {
  originPath: string | null;
}) {
  const [category, setCategory] = useState<HelpFeedbackCategory | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div
        className="grid gap-3 sm:grid-cols-3"
        role="group"
        aria-label="What do you need?"
      >
        {OPTIONS.map((option) => {
          const selected = category === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              className="helpCategoryCard"
              onClick={() => setCategory(option.id)}
            >
              <span className="block text-sm font-medium text-staff-ink">
                {option.title}
              </span>
              <span className="mt-1 block text-sm text-staff-muted">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      {category ? (
        <HelpFeedbackRequestForm
          key={category}
          category={category}
          originPath={originPath}
        />
      ) : (
        <p className="text-sm text-staff-muted">
          Choose an option to continue.
        </p>
      )}
    </div>
  );
}

function HelpFeedbackRequestForm({
  category,
  originPath,
}: {
  category: HelpFeedbackCategory;
  originPath: string | null;
}) {
  const [state, action, pending] = useActionState(
    submitHelpFeedbackAction,
    initialHelpFeedbackActionState
  );
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("");
  const [problem, setProblem] = useState("");
  const [importance, setImportance] = useState<HelpFeedbackImportance | "">("");
  const [localErrors, setLocalErrors] = useState<HelpFeedbackFieldErrors>({});

  const fieldErrors = {
    ...(state.status === "error" ? state.fieldErrors : {}),
    ...localErrors,
  };
  const hasLocalErrors = Object.values(localErrors).some((message) =>
    Boolean(message)
  );
  const formError = hasLocalErrors
    ? HELP_FEEDBACK_REVIEW_FIELDS
    : state.status === "error"
      ? state.error
      : null;
  const successMessage =
    category === "feature"
      ? HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT
      : HELP_FEEDBACK_SENT_MESSAGE;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const fieldErrors = helpFeedbackClientFieldErrors(
      readHelpFeedbackForm(new FormData(event.currentTarget))
    );
    if (Object.keys(fieldErrors).length > 0) {
      event.preventDefault();
      setLocalErrors(fieldErrors);
    }
  }

  return (
    <form
      action={action}
      className="helpFeedbackForm flex w-full min-w-0 flex-col gap-5"
      onSubmit={onSubmit}
      noValidate
    >
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="originPath" value={originPath ?? ""} />

      {category === "feature" ? (
        <FeatureFields
          goal={goal}
          problem={problem}
          importance={importance}
          pending={pending}
          fieldErrors={fieldErrors}
          onGoal={(value) => {
            setGoal(value);
            setLocalErrors((current) => ({ ...current, goal: undefined }));
          }}
          onProblem={(value) => {
            setProblem(value);
            setLocalErrors((current) => ({ ...current, problem: undefined }));
          }}
          onImportance={(value) => {
            setImportance(value);
            setLocalErrors((current) => ({
              ...current,
              importance: undefined,
            }));
          }}
        />
      ) : (
        <MessageFields
          category={category}
          summary={summary}
          message={message}
          pending={pending}
          fieldErrors={fieldErrors}
          onSummary={(value) => {
            setSummary(value);
            setLocalErrors((current) => ({ ...current, summary: undefined }));
          }}
          onMessage={(value) => {
            setMessage(value);
            setLocalErrors((current) => ({ ...current, message: undefined }));
          }}
        />
      )}

      {state.status === "success" ? (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-2 text-sm text-staff-ink"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      {formError ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      <PendingSubmitButton
        label="Send message"
        pendingLabel="Sending…"
        className="staffBtn staffBtnPrimary h-11 w-fit"
      />
    </form>
  );
}

function MessageFields({
  category,
  summary,
  message,
  pending,
  fieldErrors,
  onSummary,
  onMessage,
}: {
  category: "problem" | "question";
  summary: string;
  message: string;
  pending: boolean;
  fieldErrors: HelpFeedbackFieldErrors;
  onSummary: (value: string) => void;
  onMessage: (value: string) => void;
}) {
  const summaryHint =
    category === "problem"
      ? "A short summary of the problem."
      : "A short summary of your question.";

  return (
    <>
      <Field
        id="help-summary"
        name="summary"
        label="Subject"
        hint={summaryHint}
        value={summary}
        pending={pending}
        error={fieldErrors.summary}
        maxLength={HELP_FEEDBACK_LIMITS.summary}
        onChange={onSummary}
      />
      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="help-message"
        >
          Message
        </label>
        <textarea
          id="help-message"
          name="message"
          rows={6}
          value={message}
          disabled={pending}
          maxLength={HELP_FEEDBACK_LIMITS.message}
          aria-invalid={Boolean(fieldErrors.message) || undefined}
          aria-describedby={
            fieldErrors.message ? "help-message-error" : undefined
          }
          className="staffField"
          onChange={(event) => onMessage(event.target.value)}
        />
        {fieldErrors.message ? (
          <p id="help-message-error" className="text-sm text-red-600">
            {fieldErrors.message}
          </p>
        ) : null}
      </div>
    </>
  );
}

function FeatureFields({
  goal,
  problem,
  importance,
  pending,
  fieldErrors,
  onGoal,
  onProblem,
  onImportance,
}: {
  goal: string;
  problem: string;
  importance: HelpFeedbackImportance | "";
  pending: boolean;
  fieldErrors: HelpFeedbackFieldErrors;
  onGoal: (value: string) => void;
  onProblem: (value: string) => void;
  onImportance: (value: HelpFeedbackImportance | "") => void;
}) {
  return (
    <>
      <Field
        id="help-goal"
        name="goal"
        label="What would you like River Aftercare to help you do?"
        value={goal}
        pending={pending}
        error={fieldErrors.goal}
        maxLength={HELP_FEEDBACK_LIMITS.summary}
        onChange={onGoal}
      />
      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="help-problem"
        >
          What problem would this solve for your clinic?
        </label>
        <textarea
          id="help-problem"
          name="problem"
          rows={6}
          value={problem}
          disabled={pending}
          maxLength={HELP_FEEDBACK_LIMITS.message}
          aria-invalid={Boolean(fieldErrors.problem) || undefined}
          aria-describedby={
            fieldErrors.problem ? "help-problem-error" : undefined
          }
          className="staffField"
          onChange={(event) => onProblem(event.target.value)}
        />
        {fieldErrors.problem ? (
          <p id="help-problem-error" className="text-sm text-red-600">
            {fieldErrors.problem}
          </p>
        ) : null}
      </div>
      <fieldset className="staffChoice">
        <legend className="text-sm font-medium text-staff-ink">
          Importance{" "}
          <span className="font-normal text-staff-muted">(optional)</span>
        </legend>
        <div className="staffChoiceOptions helpImportanceOptions">
          {HELP_FEEDBACK_IMPORTANCE.map((option) => (
            <label key={option} className="staffChoiceOption">
              <input
                type="radio"
                name="importance"
                value={option}
                checked={importance === option}
                disabled={pending}
                onChange={() => onImportance(option)}
              />
              <span>{HELP_FEEDBACK_IMPORTANCE_LABELS[option]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.importance ? (
          <p className="text-sm text-red-600">{fieldErrors.importance}</p>
        ) : null}
      </fieldset>
    </>
  );
}

function Field({
  id,
  name,
  label,
  hint,
  value,
  pending,
  error,
  maxLength,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  value: string;
  pending: boolean;
  error?: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-staff-ink" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        disabled={pending}
        maxLength={maxLength}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        className="staffField"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-staff-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
