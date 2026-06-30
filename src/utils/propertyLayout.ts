import type { PropertyDefinition } from "../editorTypes";

export type PropertyLayoutSectionKind = "main" | "structure" | "root" | "hidden";
export type SystemPropertyGroup = "main" | "structure";

export const MAIN_SYSTEM_PROPERTY_IDS = new Set(["type", "status", "aliases"]);
export const STRUCTURE_SYSTEM_PROPERTY_IDS = new Set(["parentId", "childrenIds"]);
export const NON_EDITABLE_IDENTITY_PROPERTY_IDS = new Set(["id", "name"]);

export function getSystemPropertyGroup(propertyId: string): SystemPropertyGroup | undefined {
  if (STRUCTURE_SYSTEM_PROPERTY_IDS.has(propertyId)) return "structure";
  if (MAIN_SYSTEM_PROPERTY_IDS.has(propertyId)) return "main";
  return undefined;
}

export function isStructureProperty(property: Pick<PropertyDefinition, "id">): boolean {
  return STRUCTURE_SYSTEM_PROPERTY_IDS.has(property.id);
}

export function isMainSystemProperty(property: Pick<PropertyDefinition, "id">): boolean {
  return MAIN_SYSTEM_PROPERTY_IDS.has(property.id);
}

