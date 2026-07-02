import type { CustomFieldType } from "../editorTypes";

const LIST_TYPES = new Set<CustomFieldType>(["multiselect", "entity-ref-list"]);
const STRING_TYPES = new Set<CustomFieldType>([
  "text",
  "date",
  "select",
  "entity-ref",
  "url",
  "email",
  "phone",
  "file",
  "image",
]);

/**
 * Best-effort conversion of a frontmatter value when its property changes
 * type. Only clearly convertible values are transformed; anything ambiguous
 * is returned unchanged so the schema validator can flag it instead of
 * silently losing data.
 */
export function coercePropertyValue(value: unknown, toType: CustomFieldType): unknown {
  if (value === null || value === undefined) return value;

  if (LIST_TYPES.has(toType)) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const parts = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      return parts.length > 0 ? parts : [];
    }
    return [String(value)];
  }

  if (STRING_TYPES.has(toType)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return value;
  }

  if (toType === "number") {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) && value.trim() !== "" ? parsed : value;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  }

  if (toType === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true" || lowered === "yes") return true;
      if (lowered === "false" || lowered === "no") return false;
      return value;
    }
    if (typeof value === "number") return value !== 0;
    return value;
  }

  // group and unknown types: leave the value as-is
  return value;
}
