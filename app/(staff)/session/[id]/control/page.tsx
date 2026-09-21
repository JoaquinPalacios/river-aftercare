import { ProcedureSessionStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompleteSessionButton } from "@/app/(staff)/session/[id]/control/complete-session-button";
import { StageControls } from "@/app/(staff)/session/[id]/control/stage-controls";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Session control",
  description:
    "Minimal staff control surface for advancing a procedure session through its stages.",
};

interface ControlPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionControlPage({ params }: ControlPageProps) {
  const { id } = await params;
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);
  const clinic = clinicMembership!.clinic;

  const session = await getPrisma().procedureSession.findFirst({
    where: { id, clinicId: clinic.id },
    select: {
      id: true,
      status: true,
      procedureTemplateId: true,
      stageState: { select: { currentStageTemplateId: true } },
    },
  });

  if (!session) {
    notFound();
  }

  const stages = await getPrisma().procedureStageTemplate.findMany({
    where: { procedureTemplateId: session.procedureTemplateId },
    orderBy: { stageOrder: "asc" },
    select: { id: true, title: true, stageOrder: true },
  });

  const currentStageTemplateId =
    session.stageState?.currentStageTemplateId ?? null;
  const currentIndex = currentStageTemplateId
    ? stages.findIndex((stage) => stage.id === currentStageTemplateId)
    : -1;
  const currentStage = currentIndex >= 0 ? stages[currentIndex] : null;

  const isCompleted = session.status === ProcedureSessionStatus.COMPLETED;
  const canMovePrevious = !isCompleted && currentIndex > 0;
  const canMoveNext =
    !isCompleted && currentIndex >= 0 && currentIndex < stages.length - 1;

  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-6 py-12">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-zinc-500">
          Session control
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
          {currentStage
            ? `Stage ${currentIndex + 1} of ${stages.length}`
            : "Session control"}
        </h1>
        {currentStage ? (
          <p className="mt-2 text-lg font-medium text-zinc-900">
            {currentStage.title}
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Status:
          <span className="mx-1 rounded-sm bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
            {session.status}
          </span>
        </p>

        {!isCompleted ? (
          <div className="mt-6">
            <StageControls
              sessionId={session.id}
              canMovePrevious={canMovePrevious}
              canMoveNext={canMoveNext}
            />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Staff-only controls. The patient display updates from database
              state; refreshing always shows the latest persisted stage.
            </p>
          </div>
        ) : null}

        {isCompleted ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            This session is finished. Stage controls stay locked, and the room
            is now available for a new session.
          </div>
        ) : null}

        {session.status !== ProcedureSessionStatus.COMPLETED ? (
          <div className="mt-6">
            <CompleteSessionButton sessionId={session.id} />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Marks this session as completed and unblocks the room so a new
              session can start.
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-sm leading-6 text-zinc-600">
          <Link
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </p>
      </section>
    </main>
  );
}
