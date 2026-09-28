import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface CanonicalImportFile {
  label: string;
  text: string | null;
  error: string | null;
}

async function readImportFile(
  label: string,
  absolutePath: string
): Promise<CanonicalImportFile> {
  try {
    return {
      label,
      text: await readFile(absolutePath, "utf8"),
      error: null,
    };
  } catch {
    return {
      label,
      text: null,
      error: `Import file "${label}" could not be read.`,
    };
  }
}

export async function collectCanonicalImportFiles(
  targets: readonly string[]
): Promise<CanonicalImportFile[]> {
  const files: CanonicalImportFile[] = [];

  for (const target of targets) {
    const absolutePath = path.resolve(target);
    let info;
    try {
      info = await stat(absolutePath);
    } catch {
      files.push({
        label: target,
        text: null,
        error: `Import file "${target}" was not found.`,
      });
      continue;
    }

    if (info.isDirectory()) {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const names = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "en"));
      if (names.length === 0) {
        files.push({
          label: target,
          text: null,
          error: `No JSON import payloads in "${target}".`,
        });
        continue;
      }
      for (const name of names) {
        files.push(
          await readImportFile(
            path.join(target, name),
            path.join(absolutePath, name)
          )
        );
      }
      continue;
    }

    if (!info.isFile()) {
      files.push({
        label: target,
        text: null,
        error: `Import path "${target}" is not a file or directory.`,
      });
      continue;
    }

    files.push(await readImportFile(target, absolutePath));
  }

  return files;
}

export function parseCanonicalImportJson(text: string): unknown {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(source);
}
