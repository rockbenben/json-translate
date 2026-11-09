import type { JsonValue } from "@/app/types";
import { isJsonObject } from "@/app/utils/jsonUtils";

/** The picker and run validation must agree about this mode's two-level records. */
export function inspectSelectiveJson(root: JsonValue, startKey: string) {
  const starts = isJsonObject(root) ? Object.keys(root) : [];
  const supported = isJsonObject(root) && Object.values(root).some((record) =>
    isJsonObject(record) && Object.values(record).some((value) => typeof value === "string"));
  const startMissing = Boolean(startKey) && isJsonObject(root) && !Object.hasOwn(root, startKey);
  const start = startKey ? starts.indexOf(startKey) : 0;
  const fields = new Set<string>();
  // An obsolete saved start must not hide the current file's field suggestions.
  if (isJsonObject(root)) for (const key of starts.slice(Math.max(0, start))) {
    const record = root[key];
    if (!isJsonObject(record)) continue;
    for (const [field, value] of Object.entries(record)) {
      if (typeof value === "string" && field.trim() === field && field && !/[,，]/.test(field)) fields.add(field);
    }
  }
  return { starts, fields: [...fields], supported, startMissing };
}
