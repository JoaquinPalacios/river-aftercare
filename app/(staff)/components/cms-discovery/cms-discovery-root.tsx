"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  CmsAnnouncementCard,
  CmsWelcomeCard,
} from "@/app/(staff)/components/cms-discovery/discovery-card";
import {
  GuidedTour,
  TourCompletion,
} from "@/app/(staff)/components/cms-discovery/guided-tour";
import {
  CmsDiscoveryProvider,
  type CmsDiscoveryApi,
} from "@/app/(staff)/components/cms-discovery/cms-discovery-context";
import { suppressesAutomaticDiscovery } from "@/lib/cms-discovery/navigation";
import {
  CMS_DISCOVERY_EXPERIENCES,
  CMS_INTRODUCTION_ID,
} from "@/lib/cms-discovery/registry";
import { resolveCmsDiscovery } from "@/lib/cms-discovery/resolve";
import {
  emptyCmsDiscoveryStore,
  readActiveTour,
  readCmsDiscoveryStore,
  writeActiveTour,
  writeCmsDiscoveryRecord,
} from "@/lib/cms-discovery/storage";
import type {
  CmsDiscoveryContext,
  CmsDiscoveryExperience,
  CmsDiscoveryStatus,
  CmsDiscoveryStore,
} from "@/lib/cms-discovery/types";

type Session =
  | { kind: "idle" }
  | { kind: "tour"; id: string; stepIndex: number }
  | { kind: "complete"; id: string };

export function CmsDiscoveryRoot({
  context,
  experiences = CMS_DISCOVERY_EXPERIENCES,
  children,
}: {
  context: CmsDiscoveryContext;
  experiences?: readonly CmsDiscoveryExperience[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const contextRef = useRef(context);
  const experiencesRef = useRef(experiences);
  contextRef.current = context;
  experiencesRef.current = experiences;
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<CmsDiscoveryStore>(emptyCmsDiscoveryStore);
  const [session, setSession] = useState<Session>({ kind: "idle" });

  useEffect(() => {
    const currentContext = contextRef.current;
    const stored = readCmsDiscoveryStore(currentContext.userId);
    const active = readActiveTour(currentContext.userId);
    const tours = resolveCmsDiscovery(
      experiencesRef.current,
      currentContext,
      stored
    ).tours;
    const tour = active
      ? tours.find((item) => item.id === active.id)
      : undefined;

    setStore(stored);
    if (tour && active && active.stepIndex < tour.steps.length) {
      setSession({
        kind: "tour",
        id: tour.id,
        stepIndex: active.stepIndex,
      });
    } else {
      writeActiveTour(currentContext.userId, null);
      setSession({ kind: "idle" });
    }
    setReady(true);
  }, [context.userId]);

  function remember(next: Session) {
    if (next.kind === "tour") {
      writeActiveTour(context.userId, {
        id: next.id,
        stepIndex: next.stepIndex,
      });
    } else {
      writeActiveTour(context.userId, null);
    }
    setSession(next);
  }

  const resolved = useMemo(
    () => resolveCmsDiscovery(experiences, context, store),
    [context, experiences, store]
  );

  function persist(id: string, version: number, status: CmsDiscoveryStatus) {
    setStore((current) =>
      writeCmsDiscoveryRecord(context.userId, current, { id, version, status })
    );
  }

  function startTour(id: string) {
    const tour = resolved.tours.find((item) => item.id === id);
    if (!tour) {
      return;
    }
    remember({ kind: "tour", id, stepIndex: 0 });
  }

  const api = useMemo<CmsDiscoveryApi>(
    () => ({
      replay: (experienceId) => {
        if (resolved.tours.some((tour) => tour.id === experienceId)) {
          writeActiveTour(context.userId, { id: experienceId, stepIndex: 0 });
          setSession({ kind: "tour", id: experienceId, stepIndex: 0 });
        }
      },
      canReplay: (experienceId) =>
        resolved.tours.some((tour) => tour.id === experienceId),
    }),
    [context.userId, resolved.tours]
  );

  const activeTour =
    session.kind === "tour"
      ? (resolved.tours.find((tour) => tour.id === session.id) ?? null)
      : null;
  const step =
    activeTour?.steps[session.kind === "tour" ? session.stepIndex : -1];
  const announcement = resolved.announcements[0] ?? null;
  const hideCards =
    !ready || session.kind !== "idle" || suppressesAutomaticDiscovery(pathname);
  const showWelcome = !hideCards && resolved.welcome !== null;
  const showAnnouncement = !hideCards && !showWelcome && announcement !== null;

  return (
    <CmsDiscoveryProvider value={api}>
      {showWelcome && resolved.welcome ? (
        <CmsWelcomeCard
          title={resolved.welcome.title}
          body={resolved.welcome.body}
          onStart={() => startTour(resolved.welcome!.id)}
          onDismiss={() =>
            persist(
              resolved.welcome!.id,
              resolved.welcome!.version,
              "dismissed"
            )
          }
        />
      ) : null}
      {showAnnouncement && announcement ? (
        <CmsAnnouncementCard
          title={announcement.title}
          body={announcement.body}
          showMeLabel={announcement.showMeTourId ? "Show me" : null}
          onShowMe={() => {
            persist(announcement.id, announcement.version, "dismissed");
            if (announcement.showMeTourId) {
              startTour(announcement.showMeTourId);
            }
          }}
          onDismiss={() =>
            persist(announcement.id, announcement.version, "dismissed")
          }
        />
      ) : null}
      {children}
      {activeTour && step && session.kind === "tour" ? (
        <GuidedTour
          step={step}
          index={session.stepIndex}
          total={activeTour.steps.length}
          onBack={() =>
            remember({
              kind: "tour",
              id: activeTour.id,
              stepIndex: Math.max(0, session.stepIndex - 1),
            })
          }
          onSkip={() => {
            persist(activeTour.id, activeTour.version, "skipped");
            remember({ kind: "idle" });
          }}
          onNext={() => {
            if (session.stepIndex >= activeTour.steps.length - 1) {
              persist(activeTour.id, activeTour.version, "completed");
              remember({ kind: "complete", id: activeTour.id });
              return;
            }
            remember({
              kind: "tour",
              id: activeTour.id,
              stepIndex: session.stepIndex + 1,
            });
          }}
        />
      ) : null}
      {session.kind === "complete" ? (
        <TourCompletion
          title="You're set"
          body={
            session.id === CMS_INTRODUCTION_ID
              ? "You can replay this tour any time from Help & feedback."
              : "That's the end of this tour."
          }
          onClose={() => remember({ kind: "idle" })}
        />
      ) : null}
    </CmsDiscoveryProvider>
  );
}
