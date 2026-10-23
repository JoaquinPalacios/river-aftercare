"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CmsAnnouncementCard } from "@/app/(staff)/components/cms-discovery/discovery-card";
import {
  GuidedTour,
  TourCompletion,
} from "@/app/(staff)/components/cms-discovery/guided-tour";
import {
  CmsDiscoveryProvider,
  type CmsDiscoveryApi,
  type CmsDiscoveryPageTour,
} from "@/app/(staff)/components/cms-discovery/cms-discovery-context";
import {
  cmsTourHandoffHref,
  CMS_TOUR_HANDOFF_PARAM,
  discoveryPathMatches,
  requestCmsDiscoveryNavigation,
  suppressesAutomaticDiscovery,
} from "@/lib/cms-discovery/navigation";
import {
  CMS_DISCOVERY_EXPERIENCES,
  CMS_INTRODUCTION_ID,
} from "@/lib/cms-discovery/registry";
import {
  isCmsDiscoverySettled,
  resolveCmsDiscovery,
} from "@/lib/cms-discovery/resolve";
import {
  emptyCmsDiscoveryStore,
  forgetCmsDiscoveryRecords,
  readCmsDiscoveryStore,
  writeCmsDiscoveryRecord,
  type CmsDiscoverySubject,
} from "@/lib/cms-discovery/storage";
import type {
  CmsDiscoveryContext,
  CmsDiscoveryExperience,
  CmsDiscoveryStatus,
  CmsDiscoveryStore,
  ResolvedTour,
} from "@/lib/cms-discovery/types";

function discoverySubject(context: CmsDiscoveryContext): CmsDiscoverySubject {
  return {
    userId: context.userId,
    clinicId: context.clinicId,
    assisting: context.assisting,
  };
}

type Session =
  | { kind: "idle" }
  | { kind: "tour"; id: string; stepIndex: number; path: string }
  | { kind: "complete"; id: string; path: string };

function readHandoffId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const id = new URLSearchParams(window.location.search).get(
    CMS_TOUR_HANDOFF_PARAM
  );
  return id && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : null;
}

function stripHandoff(
  pathname: string,
  router: { replace: (href: string, options?: { scroll?: boolean }) => void }
) {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.has(CMS_TOUR_HANDOFF_PARAM)) {
    return;
  }
  params.delete(CMS_TOUR_HANDOFF_PARAM);
  const query = params.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

function tourIsOnPage(tour: ResolvedTour, pathname: string): boolean {
  return Boolean(
    tour.page &&
    discoveryPathMatches(pathname, tour.page.path, tour.page.match ?? "exact")
  );
}

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
  const router = useRouter();
  const replaceRef = useRef(router.replace);
  const pushRef = useRef(router.push);
  replaceRef.current = router.replace;
  pushRef.current = router.push;
  const contextRef = useRef(context);
  const experiencesRef = useRef(experiences);
  contextRef.current = context;
  experiencesRef.current = experiences;
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<CmsDiscoveryStore>(emptyCmsDiscoveryStore);
  const [session, setSession] = useState<Session>({ kind: "idle" });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const currentContext = contextRef.current;
    setStore(readCmsDiscoveryStore(discoverySubject(currentContext)));
    setSession({ kind: "idle" });
    setReady(true);
  }, [context.assisting, context.clinicId, context.userId]);

  const resolved = useMemo(
    () => resolveCmsDiscovery(experiences, context, store),
    [context, experiences, store]
  );
  const toursRef = useRef(resolved.tours);
  toursRef.current = resolved.tours;

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = readHandoffId();
    const handoff = id
      ? toursRef.current.find((tour) => tour.id === id)
      : undefined;
    const handoffHere = Boolean(handoff && tourIsOnPage(handoff, pathname));
    const current = sessionRef.current;

    if (handoffHere && handoff) {
      setSession((existing) =>
        existing.kind === "tour" &&
        existing.id === handoff.id &&
        existing.path === pathname
          ? existing
          : { kind: "tour", id: handoff.id, stepIndex: 0, path: pathname }
      );
    } else if (current.kind !== "idle" && current.path !== pathname) {
      setSession({ kind: "idle" });
    }

    if (id) {
      stripHandoff(pathname, {
        replace: (href, options) => replaceRef.current(href, options),
      });
    }
  }, [pathname, ready]);

  function persist(id: string, version: number, status: CmsDiscoveryStatus) {
    setStore((current) =>
      writeCmsDiscoveryRecord(discoverySubject(context), current, {
        id,
        version,
        status,
      })
    );
  }

  function openTour(id: string) {
    const tour = resolved.tours.find((item) => item.id === id);
    if (!tour) {
      return;
    }
    if (tour.page && !tourIsOnPage(tour, pathname)) {
      const href = cmsTourHandoffHref(tour.page.path, tour.id);
      if (!href) {
        return;
      }
      requestCmsDiscoveryNavigation(href, {
        push: (next) => pushRef.current(next),
      });
      return;
    }
    setSession({ kind: "tour", id, stepIndex: 0, path: pathname });
  }

  const api = useMemo<CmsDiscoveryApi>(() => {
    const subject = discoverySubject(context);
    const idle = ready && session.kind === "idle";
    const onOverview =
      pathname === "/dashboard" && !suppressesAutomaticDiscovery(pathname);
    const welcomeTour = resolved.welcome;
    const showWelcome = idle && onOverview && welcomeTour !== null;
    const pageTours = resolved.tours.filter((tour) => tour.page);
    const currentPageTour =
      pageTours.find((tour) => tourIsOnPage(tour, pathname)) ?? null;
    const pageTour: CmsDiscoveryPageTour | null =
      ready &&
      currentPageTour &&
      !isCmsDiscoverySettled(
        store.experiences[currentPageTour.id],
        currentPageTour.version
      )
        ? {
            id: currentPageTour.id,
            title: currentPageTour.title,
            start: () => openTour(currentPageTour.id),
          }
        : null;

    return {
      replay: openTour,
      canReplay: (experienceId) =>
        resolved.tours.some((tour) => tour.id === experienceId),
      welcome:
        showWelcome && welcomeTour
          ? { title: welcomeTour.title, body: welcomeTour.body }
          : null,
      startWelcome: () => {
        if (welcomeTour) {
          openTour(welcomeTour.id);
        }
      },
      dismissWelcome: () => {
        if (!welcomeTour) {
          return;
        }
        setStore((current) =>
          writeCmsDiscoveryRecord(subject, current, {
            id: welcomeTour.id,
            version: welcomeTour.version,
            status: "dismissed",
          })
        );
      },
      pageTour,
      canRestorePageTours: pageTours.length > 0,
      showPageToursAgain: () => {
        setStore((current) =>
          forgetCmsDiscoveryRecords(
            subject,
            current,
            pageTours.map((tour) => tour.id)
          )
        );
      },
    };
    // openTour is recreated in this render and closes over pathname and resolved.
  }, [context, pathname, ready, resolved, session.kind, store]);

  const activeTour =
    session.kind === "tour" && session.path === pathname
      ? (resolved.tours.find((tour) => tour.id === session.id) ?? null)
      : null;
  const step =
    activeTour?.steps[session.kind === "tour" ? session.stepIndex : -1];
  const announcement = resolved.announcements[0] ?? null;
  const hideCards =
    !ready || session.kind !== "idle" || suppressesAutomaticDiscovery(pathname);
  const showAnnouncement =
    !hideCards && resolved.welcome === null && announcement !== null;

  return (
    <CmsDiscoveryProvider value={api}>
      {showAnnouncement && announcement ? (
        <CmsAnnouncementCard
          title={announcement.title}
          body={announcement.body}
          showMeLabel={announcement.showMeTourId ? "Show me" : null}
          onShowMe={() => {
            persist(announcement.id, announcement.version, "dismissed");
            if (announcement.showMeTourId) {
              openTour(announcement.showMeTourId);
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
            setSession({
              kind: "tour",
              id: activeTour.id,
              stepIndex: Math.max(0, session.stepIndex - 1),
              path: session.path,
            })
          }
          onSkip={() => {
            persist(activeTour.id, activeTour.version, "skipped");
            setSession({ kind: "idle" });
          }}
          onNext={() => {
            if (session.stepIndex >= activeTour.steps.length - 1) {
              persist(activeTour.id, activeTour.version, "completed");
              setSession({
                kind: "complete",
                id: activeTour.id,
                path: pathname,
              });
              return;
            }
            setSession({
              kind: "tour",
              id: activeTour.id,
              stepIndex: session.stepIndex + 1,
              path: session.path,
            });
          }}
        />
      ) : null}
      {session.kind === "complete" && session.path === pathname ? (
        <TourCompletion
          title="You're set"
          body={
            session.id === CMS_INTRODUCTION_ID
              ? "You can replay this tour from Help & feedback."
              : "That's the end of this page tour. Help & feedback can show the invitation again."
          }
          onClose={() => setSession({ kind: "idle" })}
        />
      ) : null}
    </CmsDiscoveryProvider>
  );
}
