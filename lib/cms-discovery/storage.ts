import {
  CMS_DISCOVERY_STORE_SCHEMA,
  type CmsDiscoveryRecord,
  type CmsDiscoveryStatus,
  type CmsDiscoveryStore,
} from "@/lib/cms-discovery/types";

const KEY_PREFIX = "river-aftercare:cms-discovery:";
const ACTIVE_PREFIX = "river-aftercare:cms-discovery-active:";
const SCOPE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export type CmsDiscoverySubject = {
  userId: string;
  clinicId: string;
  assisting: boolean;
};

/**
 * Clinic members keep a per-user key. An assisting operator can open more
 * than one clinic, so that record is per user and clinic and does not reuse
 * a clinic member's key.
 */
export function cmsDiscoveryScopeId(
  subject: CmsDiscoverySubject
): string | null {
  if (!SCOPE_ID.test(subject.userId)) {
    return null;
  }

  if (!subject.assisting) {
    return subject.userId;
  }

  if (!SCOPE_ID.test(subject.clinicId)) {
    return null;
  }

  return `${subject.userId}:${subject.clinicId}`;
}
const EXPERIENCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set<CmsDiscoveryStatus>([
  "completed",
  "dismissed",
  "skipped",
]);

const memory = new Map<string, string>();
const activeMemory = new Map<string, string>();

export type ActiveCmsDiscoveryTour = {
  id: string;
  stepIndex: number;
};

export function emptyCmsDiscoveryStore(): CmsDiscoveryStore {
  return { schema: CMS_DISCOVERY_STORE_SCHEMA, experiences: {} };
}

export function cmsDiscoveryStorageKey(
  subject: CmsDiscoverySubject
): string | null {
  const scope = cmsDiscoveryScopeId(subject);
  if (!scope) {
    return null;
  }

  return `${KEY_PREFIX}${scope}`;
}

export function parseCmsDiscoveryStore(raw: string | null): CmsDiscoveryStore {
  if (!raw) {
    return emptyCmsDiscoveryStore();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyCmsDiscoveryStore();
  }

  if (!parsed || typeof parsed !== "object") {
    return emptyCmsDiscoveryStore();
  }

  if ((parsed as { schema?: unknown }).schema !== CMS_DISCOVERY_STORE_SCHEMA) {
    return emptyCmsDiscoveryStore();
  }

  const experiencesIn = (parsed as { experiences?: unknown }).experiences;
  if (!experiencesIn || typeof experiencesIn !== "object") {
    return emptyCmsDiscoveryStore();
  }

  const experiences: Record<string, CmsDiscoveryRecord> = {};
  for (const [id, value] of Object.entries(experiencesIn)) {
    if (!EXPERIENCE_ID.test(id) || !value || typeof value !== "object") {
      continue;
    }

    const version = (value as { version?: unknown }).version;
    const status = (value as { status?: unknown }).status;
    if (
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      typeof status !== "string" ||
      !STATUSES.has(status as CmsDiscoveryStatus)
    ) {
      continue;
    }

    experiences[id] = {
      version,
      status: status as CmsDiscoveryStatus,
    };
  }

  return { schema: CMS_DISCOVERY_STORE_SCHEMA, experiences };
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

export function readCmsDiscoveryStore(
  subject: CmsDiscoverySubject
): CmsDiscoveryStore {
  const key = cmsDiscoveryStorageKey(subject);
  if (!key || typeof window === "undefined") {
    return emptyCmsDiscoveryStore();
  }

  return parseCmsDiscoveryStore(readRaw(key));
}

export function writeCmsDiscoveryRecord(
  subject: CmsDiscoverySubject,
  store: CmsDiscoveryStore,
  record: { id: string; version: number; status: CmsDiscoveryStatus }
): CmsDiscoveryStore {
  if (!EXPERIENCE_ID.test(record.id) || record.version < 1) {
    return store;
  }

  const next: CmsDiscoveryStore = {
    schema: CMS_DISCOVERY_STORE_SCHEMA,
    experiences: {
      ...store.experiences,
      [record.id]: { version: record.version, status: record.status },
    },
  };
  const key = cmsDiscoveryStorageKey(subject);
  if (key && typeof window !== "undefined") {
    writeRaw(key, JSON.stringify(next));
  }

  return next;
}

function activeKey(subject: CmsDiscoverySubject): string | null {
  const scope = cmsDiscoveryScopeId(subject);
  if (!scope) {
    return null;
  }

  return `${ACTIVE_PREFIX}${scope}`;
}

function readSessionRaw(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return activeMemory.get(key) ?? null;
  }
}

function writeSessionRaw(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
    activeMemory.delete(key);
  } catch {
    if (value === null) {
      activeMemory.delete(key);
    } else {
      activeMemory.set(key, value);
    }
  }
}

/**
 * The clinic workspace and account pages mount separate shells.
 * The open tour step is kept for this tab so Next can resume it.
 * Completion and dismissal stay in localStorage.
 */
export function readActiveTour(
  subject: CmsDiscoverySubject
): ActiveCmsDiscoveryTour | null {
  const key = activeKey(subject);
  if (!key || typeof window === "undefined") {
    return null;
  }

  const raw = readSessionRaw(key);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const id = (parsed as { id?: unknown }).id;
  const stepIndex = (parsed as { stepIndex?: unknown }).stepIndex;
  if (
    typeof id !== "string" ||
    !EXPERIENCE_ID.test(id) ||
    typeof stepIndex !== "number" ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0
  ) {
    return null;
  }

  return { id, stepIndex };
}

export function writeActiveTour(
  subject: CmsDiscoverySubject,
  tour: ActiveCmsDiscoveryTour | null
): void {
  const key = activeKey(subject);
  if (!key || typeof window === "undefined") {
    return;
  }

  if (!tour || !EXPERIENCE_ID.test(tour.id) || tour.stepIndex < 0) {
    writeSessionRaw(key, null);
    return;
  }

  writeSessionRaw(
    key,
    JSON.stringify({ id: tour.id, stepIndex: tour.stepIndex })
  );
}
