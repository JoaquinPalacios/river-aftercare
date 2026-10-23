import {
  CMS_DISCOVERY_STORE_SCHEMA,
  type CmsDiscoveryRecord,
  type CmsDiscoveryStatus,
  type CmsDiscoveryStore,
} from "@/lib/cms-discovery/types";

const KEY_PREFIX = "river-aftercare:cms-discovery:";
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

/**
 * Drop selected experience records and leave every other record in place.
 * Used to show page-tour invitations again without touching the workspace
 * introduction or feature announcements.
 */
export function forgetCmsDiscoveryRecords(
  subject: CmsDiscoverySubject,
  store: CmsDiscoveryStore,
  ids: readonly string[]
): CmsDiscoveryStore {
  const drop = new Set(ids.filter((id) => EXPERIENCE_ID.test(id)));
  if (drop.size === 0) {
    return store;
  }

  let changed = false;
  const experiences = { ...store.experiences };
  for (const id of drop) {
    if (id in experiences) {
      delete experiences[id];
      changed = true;
    }
  }
  if (!changed) {
    return store;
  }

  const next: CmsDiscoveryStore = {
    schema: CMS_DISCOVERY_STORE_SCHEMA,
    experiences,
  };
  const key = cmsDiscoveryStorageKey(subject);
  if (key && typeof window !== "undefined") {
    writeRaw(key, JSON.stringify(next));
  }

  return next;
}
