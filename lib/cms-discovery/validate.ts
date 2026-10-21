import { isSafeDiscoveryPath } from "@/lib/cms-discovery/navigation";
import type { CmsDiscoveryExperience } from "@/lib/cms-discovery/types";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function cmsDiscoveryRegistryIssues(
  experiences: readonly CmsDiscoveryExperience[]
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  let welcomes = 0;

  for (const experience of experiences) {
    if (!ID.test(experience.id)) {
      issues.push(`Experience id "${experience.id}" must be kebab-case.`);
    }
    if (ids.has(experience.id)) {
      issues.push(`Experience id "${experience.id}" is duplicated.`);
    }
    ids.add(experience.id);

    if (!Number.isInteger(experience.version) || experience.version < 1) {
      issues.push(
        `Experience "${experience.id}" needs a version of 1 or more.`
      );
    }
    if (!experience.title.trim() || !experience.body.trim()) {
      issues.push(`Experience "${experience.id}" needs a title and body.`);
    }

    if (experience.kind === "tour") {
      if (experience.offer === "welcome") {
        welcomes += 1;
      }
      if (experience.steps.length === 0) {
        issues.push(`Tour "${experience.id}" needs at least one step.`);
      }

      const stepIds = new Set<string>();
      for (const step of experience.steps) {
        const label = `${experience.id}/${step.id}`;
        if (!ID.test(step.id) || stepIds.has(step.id)) {
          issues.push(`Step "${label}" needs a unique kebab-case id.`);
        }
        stepIds.add(step.id);
        if (!ID.test(step.target)) {
          issues.push(`Step "${label}" has an invalid target.`);
        }
        if (step.fallbackTarget && !ID.test(step.fallbackTarget)) {
          issues.push(`Step "${label}" has an invalid fallback target.`);
        }
        if (step.path && !isSafeDiscoveryPath(step.path)) {
          issues.push(`Step "${label}" has an invalid path.`);
        }
        if (!step.title.trim() || !step.body.trim()) {
          issues.push(`Step "${label}" needs a title and body.`);
        }
      }
    }
  }

  if (welcomes > 1) {
    issues.push("Only one tour can use the welcome offer.");
  }

  for (const experience of experiences) {
    if (experience.kind !== "announcement" || !experience.showMeTourId) {
      continue;
    }

    const tour = experiences.find(
      (item) => item.id === experience.showMeTourId
    );
    if (!tour || tour.kind !== "tour") {
      issues.push(
        `Announcement "${experience.id}" points at a missing tour "${experience.showMeTourId}".`
      );
    }
  }

  return issues;
}
