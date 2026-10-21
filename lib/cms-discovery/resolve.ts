import { audienceMatches, stepMatches } from "@/lib/cms-discovery/audience";
import type {
  CmsDiscoveryContext,
  CmsDiscoveryExperience,
  CmsDiscoveryRecord,
  CmsDiscoveryStore,
  ResolvedAnnouncement,
  ResolvedTour,
} from "@/lib/cms-discovery/types";

export function isCmsDiscoverySettled(
  record: CmsDiscoveryRecord | undefined,
  version: number
): boolean {
  if (!record) {
    return false;
  }

  return record.version >= version;
}

export function resolveCmsDiscovery(
  experiences: readonly CmsDiscoveryExperience[],
  context: CmsDiscoveryContext,
  store: CmsDiscoveryStore
): {
  welcome: ResolvedTour | null;
  announcements: ResolvedAnnouncement[];
  tours: ResolvedTour[];
} {
  const tours: ResolvedTour[] = [];

  for (const experience of experiences) {
    if (experience.kind !== "tour") {
      continue;
    }
    if (!audienceMatches(experience.audience, context)) {
      continue;
    }

    const steps = experience.steps.filter((step) => stepMatches(step, context));
    if (steps.length === 0) {
      continue;
    }

    tours.push({
      id: experience.id,
      version: experience.version,
      title: experience.title,
      body: experience.body,
      steps: [...steps],
    });
  }

  const toursById = new Map(tours.map((tour) => [tour.id, tour]));
  let welcome: ResolvedTour | null = null;

  for (const experience of experiences) {
    if (experience.kind !== "tour" || experience.offer !== "welcome") {
      continue;
    }

    const tour = toursById.get(experience.id);
    if (!tour) {
      continue;
    }
    if (
      isCmsDiscoverySettled(
        store.experiences[experience.id],
        experience.version
      )
    ) {
      continue;
    }

    welcome = tour;
    break;
  }

  const announcements: ResolvedAnnouncement[] = [];

  for (const experience of experiences) {
    if (experience.kind !== "announcement") {
      continue;
    }
    if (!audienceMatches(experience.audience, context)) {
      continue;
    }
    if (
      isCmsDiscoverySettled(
        store.experiences[experience.id],
        experience.version
      )
    ) {
      continue;
    }

    const showMeTour = experience.showMeTourId
      ? (toursById.get(experience.showMeTourId) ?? null)
      : null;

    announcements.push({
      id: experience.id,
      version: experience.version,
      title: experience.title,
      body: experience.body,
      showMeTourId: showMeTour?.id ?? null,
    });
  }

  return { welcome, announcements, tours };
}
