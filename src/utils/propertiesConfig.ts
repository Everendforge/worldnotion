import YAML from "yaml";
import type { CustomFieldDefinition, CustomFieldType, PropertiesConfig, PropertyDefinition } from "../editorTypes";

export type VisiblePropertyDefinition = PropertyDefinition & { source: "base" | "custom" };

export type UnconfiguredProperty = {
  key: string;
  value: unknown;
  inferredType: CustomFieldType;
};

const BASE_FRONTMATTER_KEYS = ["id", "type", "name", "status", "tags", "aliases", "parentId", "childrenIds", "folder"];

export function knownPropertyIds(config?: PropertiesConfig): Set<string> {
  const ids = new Set<string>(BASE_FRONTMATTER_KEYS);
  config?.baseProperties?.definitions.forEach((property) => ids.add(property.id));
  config?.customFields.definitions.forEach((property) => ids.add(property.id));
  return ids;
}

export function listVisibleProperties(config?: PropertiesConfig, entityType?: string): VisiblePropertyDefinition[] {
  if (!config?.baseProperties) return [];
  const typeDefinition = entityType
    ? config.entityTypes.definitions.find((candidate) => candidate.id === entityType)
    : undefined;
  const baseVisible = typeDefinition?.visibleProperties?.length
    ? typeDefinition.visibleProperties
    : config.baseProperties.visibleByDefault ?? ["id", "name", "type", "status", "tags"];
  const customVisible = [
    ...(config.customFields.globalFields ?? []),
    ...(typeDefinition?.customFields ?? []),
  ];
  const visibleIds = new Set([...baseVisible, ...customVisible]);
  const order = [...(typeDefinition?.propertyOrder ?? config.baseProperties.order ?? []), ...customVisible];

  const properties: VisiblePropertyDefinition[] = [
    ...config.baseProperties.definitions.map((property) => ({ ...property, source: "base" as const })),
    ...config.customFields.definitions
      .filter((property) => !config.baseProperties?.definitions.some((baseProperty) => baseProperty.id === property.id))
      .map((property) => ({ ...property, source: "custom" as const })),
  ].filter((property) => visibleIds.has(property.id) && !("hidden" in property && property.hidden));

  return properties.sort((first, second) => {
    const firstIndex = order.indexOf(first.id);
    const secondIndex = order.indexOf(second.id);
    if (firstIndex === -1 && secondIndex === -1) {
      return (first.label ?? first.id).localeCompare(second.label ?? second.id);
    }
    if (firstIndex === -1) return 1;
    if (secondIndex === -1) return -1;
    return firstIndex - secondIndex;
  });
}

export function listAllProperties(config?: PropertiesConfig): VisiblePropertyDefinition[] {
  if (!config?.baseProperties) return [];
  return [
    ...config.baseProperties.definitions.map((property) => ({ ...property, source: "base" as const })),
    ...config.customFields.definitions
      .filter((property) => !config.baseProperties?.definitions.some((baseProperty) => baseProperty.id === property.id))
      .map((property) => ({ ...property, source: "custom" as const })),
  ];
}

export function listUnconfiguredProperties(
  frontmatterData: Record<string, unknown>,
  config?: PropertiesConfig,
): UnconfiguredProperty[] {
  const knownIds = knownPropertyIds(config);
  return Object.entries(frontmatterData)
    .filter(([key]) => !knownIds.has(key))
    .map(([key, value]) => ({
      key,
      value,
      inferredType: inferPropertyType(value),
    }));
}

export function inferPropertyType(value: unknown): CustomFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "multiselect";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  if (typeof value === "string" && /^https?:\/\//.test(value)) return "url";
  return "text";
}

export function inferPropertyDefinition(key: string, value: unknown): CustomFieldDefinition {
  const inferredType = inferPropertyType(value);
  const options =
    inferredType === "select" || inferredType === "multiselect"
      ? valuesToOptions(Array.isArray(value) ? value : [value])
      : undefined;
  return {
    id: key.trim() || sanitizePropertyId(labelFromPropertyId(key)),
    label: labelFromPropertyId(key),
    type: inferredType,
    required: false,
    ...(options?.length ? { options } : {}),
  };
}

export function addPropertyToConfig(config: PropertiesConfig, property: CustomFieldDefinition): PropertiesConfig {
  const existingDefinitions = config.customFields.definitions ?? [];
  const existingGlobalFields = config.customFields.globalFields ?? [];
  const nextDefinitions = existingDefinitions.some((candidate) => candidate.id === property.id)
    ? existingDefinitions.map((candidate) => (candidate.id === property.id ? property : candidate))
    : [...existingDefinitions, property];
  const nextGlobalFields = existingGlobalFields.includes(property.id)
    ? existingGlobalFields
    : [...existingGlobalFields, property.id];
  return {
    ...config,
    customFields: {
      ...config.customFields,
      definitions: nextDefinitions,
      globalFields: nextGlobalFields,
    },
  };
}

export function parseFrontmatterRaw(frontmatterRaw: string): Record<string, unknown> {
  const trimmed = frontmatterRaw.trim();
  if (!trimmed.startsWith("---")) return {};
  const body = trimmed.replace(/^---\s*/, "").replace(/\s*---$/, "");
  try {
    const parsed = YAML.parse(body) as Record<string, unknown> | null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function frontmatterDataToRaw(data: Record<string, unknown>): string {
  return `---\n${YAML.stringify(data)}---`;
}

export function removeFrontmatterProperty(frontmatterRaw: string, key: string): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  delete data[key];
  return frontmatterDataToRaw(data);
}

export function adaptFrontmatterProperty(frontmatterRaw: string, fromKey: string, toKey: string): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  if (!(fromKey in data)) return frontmatterRaw;
  data[toKey] = data[fromKey];
  delete data[fromKey];
  return frontmatterDataToRaw(data);
}

export function sanitizePropertyId(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function labelFromPropertyId(value: string): string {
  const normalized = value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Property";
}

export function valuesToOptions(values: unknown[]) {
  return values
    .filter((value): value is string | number | boolean => ["string", "number", "boolean"].includes(typeof value))
    .map((value) => {
      const label = String(value);
      return { value: sanitizePropertyId(label) || label, label };
    });
}

export function propertyUsesOptions(type: CustomFieldType) {
  return type === "select" || type === "multiselect";
}
