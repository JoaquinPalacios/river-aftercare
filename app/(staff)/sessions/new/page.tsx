import type { Metadata } from "next";
import Link from "next/link";

import { NewSessionForm } from "@/app/(staff)/sessions/new/new-session-form";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { listSessionFormOptions } from "@/lib/sessions/list-session-form-options";

export const metadata: Metadata = {
  title: "Start a session",
  description:
    "Create a draft procedure session for a room, doctor, and procedure template.",
};

export default async function NewSessionPage() {
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);
  const clinic = clinicMembership!.clinic;

  const options = await listSessionFormOptions(clinic.id);

  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-6 py-12">
      <section className="w-full max-w-3xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-zinc-500">
            {clinic.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
            Start a new session
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Create a draft session for a room, doctor, and procedure template.
            The session starts in draft and is ready to be activated from the
            control screen.
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            <Link
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <NewSessionForm options={options} />
        </div>
      </section>
    </main>
  );
}
