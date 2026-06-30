import type { CustomFieldDefinition, EntityTypeDefinition, TaxonomyConfig } from "../editorTypes";
import { unwrapWorldbuildingDetailsGroup } from "./taxonomyConfig";

/**
 * Property template for quick setup.
 *
 * Base Everend fields live in the taxonomy baseProperties contract. Templates
 * should add universe-specific modules and optional starter entity types.
 */
export type PropertyTemplate = {
  id: string;
  label: string;
  description: string;
  /**
   * IDs of base properties to show/order by default.
   */
  visibleBaseProperties: string[];
  /**
   * Custom field definitions to add.
   */
  customFields: CustomFieldDefinition[];
  /**
   * Optional starter entity types to merge into the universe taxonomy.
   */
  entityTypes?: EntityTypeDefinition[];
  /**
   * Optional per-type property visibility and order.
   */
  typeProperties?: Record<string, string[]>;
};

const EVEREND_BASE_VISIBLE = ["type", "status", "aliases"];
const EVEREND_HIERARCHY_BASE = ["parentId", "childrenIds"];

export const EVEREND_SPEC_ENTITY_TYPES: EntityTypeDefinition[] = [
  {
    id: "character",
    label: "Character",
    description: "Person, creature, or viewpoint actor",
    icon: "user",
    color: "#3b82f6",
    customFields: [],
  },
  {
    id: "location",
    label: "Location",
    description: "Place, region, settlement, or site",
    icon: "map-pin",
    color: "#10b981",
    customFields: [],
  },
  {
    id: "organization",
    label: "Organization",
    description: "Faction, institution, house, or guild",
    icon: "users",
    color: "#f59e0b",
    customFields: [],
  },
  {
    id: "event",
    label: "Event",
    description: "Canon event or historical beat",
    icon: "calendar",
    color: "#ef4444",
    customFields: [],
  },
  {
    id: "concept",
    label: "Concept",
    description: "Idea, law, magic rule, or abstract note",
    icon: "lightbulb",
    color: "#8b5cf6",
    customFields: [],
  },
  {
    id: "item",
    label: "Item",
    description: "Object, relic, tool, or artifact",
    icon: "package",
    color: "#ec4899",
    customFields: [],
  },
  {
    id: "world",
    label: "World",
    description: "Major setting, planet, realm, or connected world",
    icon: "globe",
    color: "#0ea5e9",
    customFields: [],
  },
  {
    id: "cycle",
    label: "Cycle",
    description: "Era, cycle, age, or large continuity span",
    icon: "refresh-cw",
    color: "#14b8a6",
    customFields: [],
  },
  {
    id: "universe",
    label: "Universe",
    description: "Top-level canon container or cosmology",
    icon: "sparkles",
    color: "#a855f7",
    customFields: [],
  },
  {
    id: "story",
    label: "Story",
    description: "Narrative work, storyline, or authored plot container",
    icon: "book-open",
    color: "#f97316",
    customFields: [],
  },
  {
    id: "arc",
    label: "Arc",
    description: "Narrative arc within a story or continuity",
    icon: "route",
    color: "#eab308",
    customFields: [],
  },
  {
    id: "scene",
    label: "Scene",
    description: "Narrative scene, beat, or planning unit",
    icon: "film",
    color: "#22c55e",
    customFields: [],
  },
  {
    id: "quest",
    label: "Quest",
    description: "Playable or authored objective chain",
    icon: "flag",
    color: "#06b6d4",
    customFields: [],
  },
];

/**
 * Minimal template - only the Everend base contract.
 */
export const MINIMAL_TEMPLATE: PropertyTemplate = {
  id: "minimal",
  label: "Minimal",
  description: "Only the Everend base contract",
  visibleBaseProperties: EVEREND_BASE_VISIBLE,
  customFields: [],
};

/**
 * Standard template - base contract plus a small assignment field.
 */
export const STANDARD_TEMPLATE: PropertyTemplate = {
  id: "standard",
  label: "Standard",
  description: "Everend base contract with a small general-purpose extension",
  visibleBaseProperties: EVEREND_BASE_VISIBLE,
  customFields: [
    {
      id: "owner-note",
      label: "Owner Note",
      type: "text",
      description: "Freeform ownership, team, or responsibility note",
      required: false,
    },
  ],
};

/**
 * Collaborative template - base contract plus collaboration metadata.
 */
export const COLLABORATIVE_TEMPLATE: PropertyTemplate = {
  id: "collaborative",
  label: "Collaborative",
  description: "Team collaboration with author tracking and assignments",
  visibleBaseProperties: EVEREND_BASE_VISIBLE,
  customFields: [
    {
      id: "author",
      label: "Author",
      type: "text",
      description: "Person who created this entity",
      required: false,
    },
    {
      id: "lastModified",
      label: "Last Modified",
      type: "date",
      description: "Date of last modification",
      required: false,
    },
    {
      id: "assignee",
      label: "Assignee",
      type: "text",
      description: "Person assigned to this entity",
      required: false,
    },
  ],
};

/**
 * Worldbuilding template - modular narrative universe schema.
 *
 * The generated schema keeps frontmatter flat while presenting custom fields as
 * editable property trees. Root groups are concern-based so a property ID exists
 * once and can still appear for several entity types.
 */
export const WORLDBUILDING_TEMPLATE: PropertyTemplate = {
  id: "worldbuilding",
  label: "Worldbuilding",
  description: "Modular narrative universe properties aligned with Everend Spec starter types",
  visibleBaseProperties: [...EVEREND_BASE_VISIBLE, ...EVEREND_HIERARCHY_BASE],
  entityTypes: EVEREND_SPEC_ENTITY_TYPES,
  customFields: [
    {
      id: "lore-level",
      label: "Lore Level",
      type: "select",
      description: "Level of detail or canonicity for this entity",
      required: false,
      options: [
        { value: "canon", label: "Canon", color: "#10b981" },
        { value: "semi-canon", label: "Semi-canon", color: "#f59e0b" },
        { value: "draft", label: "Draft", color: "#64748b" },
        { value: "idea", label: "Idea", color: "#94a3b8" },
      ],
    },
    {
      id: "identity",
      label: "Identity",
      type: "group",
      description: "Roles, homes, affiliations, ownership, and identity relationships",
      required: false,
      visibleWhen: { type: ["character", "organization", "item"] },
      children: [
        {
          id: "role",
          label: "Role",
          type: "select",
          description: "Narrative or institutional function",
          required: false,
          visibleWhen: { type: ["character", "organization"] },
          options: [
            { value: "protagonist", label: "Protagonist", color: "#2563eb" },
            { value: "antagonist", label: "Antagonist", color: "#dc2626" },
            { value: "ally", label: "Ally", color: "#16a34a" },
            { value: "mentor", label: "Mentor", color: "#7c3aed" },
            { value: "supporting", label: "Supporting", color: "#64748b" },
          ],
        },
        {
          id: "affiliation",
          label: "Affiliation",
          type: "entity-ref",
          description: "Organization, faction, house, or group connected to this note",
          required: false,
          visibleWhen: { type: ["character"] },
          targetTypes: ["organization"],
        },
        {
          id: "home",
          label: "Home",
          type: "entity-ref",
          description: "Primary place connected to this entity",
          required: false,
          visibleWhen: { type: ["character", "organization"] },
          targetTypes: ["location", "world"],
        },
        {
          id: "owner",
          label: "Owner",
          type: "entity-ref",
          description: "Current or notable owner",
          required: false,
          visibleWhen: { type: ["item"] },
          targetTypes: ["character", "organization"],
        },
      ],
    },
    {
      id: "place",
      label: "Place",
      type: "group",
      description: "Spatial scope and location relationships",
      required: false,
      visibleWhen: { type: ["location", "world", "item", "event", "story", "arc", "scene", "quest"] },
      children: [
        {
          id: "scale",
          label: "Scale",
          type: "select",
          description: "Physical or social scale",
          required: false,
          visibleWhen: { type: ["location", "world"] },
          options: [
            { value: "room", label: "Room", color: "#94a3b8" },
            { value: "building", label: "Building", color: "#64748b" },
            { value: "settlement", label: "Settlement", color: "#10b981" },
            { value: "region", label: "Region", color: "#0ea5e9" },
            { value: "world", label: "World", color: "#8b5cf6" },
          ],
        },
        {
          id: "region",
          label: "Region",
          type: "entity-ref",
          description: "Parent or surrounding location",
          required: false,
          visibleWhen: { type: ["location"] },
          targetTypes: ["location", "world"],
        },
        {
          id: "population",
          label: "Population",
          type: "text",
          description: "Population estimate or known inhabitants",
          required: false,
          visibleWhen: { type: ["location", "world"] },
        },
        {
          id: "location",
          label: "Location",
          type: "entity-ref",
          description: "Place where this event, story, scene, quest, or object belongs",
          required: false,
          visibleWhen: { type: ["item", "event", "story", "arc", "scene", "quest"] },
          targetTypes: ["location", "world"],
        },
      ],
    },
    {
      id: "narrative",
      label: "Narrative",
      type: "group",
      description: "Story structure, timing, and participation",
      required: false,
      visibleWhen: { type: ["character", "event", "story", "arc", "scene", "quest"] },
      children: [
        {
          id: "arc",
          label: "Arc",
          type: "select",
          description: "Narrative arc state",
          required: false,
          visibleWhen: { type: ["character", "story", "arc", "scene", "quest"] },
          options: [
            { value: "setup", label: "Setup", color: "#94a3b8" },
            { value: "rising", label: "Rising", color: "#3b82f6" },
            { value: "turning-point", label: "Turning Point", color: "#f59e0b" },
            { value: "climax", label: "Climax", color: "#ef4444" },
            { value: "resolution", label: "Resolution", color: "#10b981" },
          ],
        },
        {
          id: "date",
          label: "Date",
          type: "date",
          description: "In-world or planning date",
          required: false,
          visibleWhen: { type: ["event", "scene"] },
        },
        {
          id: "participants",
          label: "Participants",
          type: "entity-ref-list",
          description: "Characters or organizations involved",
          required: false,
          visibleWhen: { type: ["event", "story", "arc", "scene", "quest"] },
          targetTypes: ["character", "organization"],
        },
      ],
    },
    {
      id: "item-details",
      label: "Item",
      type: "group",
      description: "Item materiality and rarity",
      required: false,
      visibleWhen: { type: ["item"] },
      children: [
        {
          id: "rarity",
          label: "Rarity",
          type: "select",
          description: "How common or legendary an item is",
          required: false,
          visibleWhen: { type: ["item"] },
          options: [
            { value: "common", label: "Common", color: "#94a3b8" },
            { value: "uncommon", label: "Uncommon", color: "#10b981" },
            { value: "rare", label: "Rare", color: "#3b82f6" },
            { value: "legendary", label: "Legendary", color: "#f59e0b" },
            { value: "unique", label: "Unique", color: "#ec4899" },
          ],
        },
        {
          id: "material",
          label: "Material",
          type: "text",
          description: "Primary material, component, or substance",
          required: false,
          visibleWhen: { type: ["item"] },
        },
      ],
    },
    {
      id: "concept-details",
      label: "Concept",
      type: "group",
      description: "Ideas, rules, categories, cosmology, and abstract systems",
      required: false,
      visibleWhen: { type: ["concept", "world", "cycle", "universe"] },
      children: [
        {
          id: "theme",
          label: "Theme",
          type: "text",
          description: "Major idea, motif, or concept family",
          required: false,
          visibleWhen: { type: ["concept", "world", "cycle", "universe"] },
        },
        {
          id: "rules",
          label: "Rules",
          type: "text",
          description: "Important constraints, laws, or operating rules",
          required: false,
          visibleWhen: { type: ["concept", "world", "cycle", "universe"] },
        },
        {
          id: "category",
          label: "Category",
          type: "select",
          description: "Worldbuilding category",
          required: false,
          visibleWhen: { type: ["concept", "world", "cycle", "universe"] },
          options: [
            { value: "character", label: "Character", color: "#3b82f6" },
            { value: "location", label: "Location", color: "#10b981" },
            { value: "item", label: "Item", color: "#ec4899" },
            { value: "event", label: "Event", color: "#ef4444" },
            { value: "concept", label: "Concept", color: "#8b5cf6" },
            { value: "faction", label: "Faction", color: "#f59e0b" },
          ],
        },
      ],
    },
  ],
  typeProperties: {
    character: ["type", "status", "aliases", "lore-level", "identity", "narrative"],
    location: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place"],
    organization: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "identity"],
    item: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "identity", "place", "item-details"],
    event: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "narrative"],
    concept: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "concept-details"],
    world: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "concept-details"],
    cycle: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "concept-details"],
    universe: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "concept-details"],
    story: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "narrative"],
    arc: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "narrative"],
    scene: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "narrative"],
    quest: ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place", "narrative"],
  },
};

/**
 * Task Management template - for project/task tracking.
 */
export const TASK_MANAGEMENT_TEMPLATE: PropertyTemplate = {
  id: "task-management",
  label: "Task Management",
  description: "Project and task tracking with priorities and deadlines",
  visibleBaseProperties: EVEREND_BASE_VISIBLE,
  customFields: [
    {
      id: "priority",
      label: "Priority",
      type: "select",
      description: "Task priority level",
      required: false,
      options: [
        { value: "urgent", label: "Urgent", color: "#ef4444" },
        { value: "high", label: "High", color: "#f59e0b" },
        { value: "medium", label: "Medium", color: "#eab308" },
        { value: "low", label: "Low", color: "#10b981" },
      ],
    },
    {
      id: "dueDate",
      label: "Due Date",
      type: "date",
      description: "Task deadline",
      required: false,
    },
    {
      id: "assignee",
      label: "Assignee",
      type: "text",
      description: "Person assigned to this task",
      required: false,
    },
  ],
};

/**
 * All available property templates.
 */
export const PROPERTY_TEMPLATES: PropertyTemplate[] = [
  WORLDBUILDING_TEMPLATE,
];

function propertyTreeIds(properties: CustomFieldDefinition[]): string[] {
  const ids: string[] = [];
  const visit = (property: CustomFieldDefinition) => {
    ids.push(property.id);
    property.children?.forEach((child) => visit(child as CustomFieldDefinition));
  };
  properties.forEach(visit);
  return ids;
}

/**
 * Apply a property template to a taxonomy config.
 */
export function applyPropertyTemplate(
  taxonomyConfig: TaxonomyConfig,
  template: PropertyTemplate
): TaxonomyConfig {
  if (!taxonomyConfig.baseProperties) {
    throw new Error("Taxonomy config must have baseProperties defined");
  }

  const newVisibleByDefault = [...template.visibleBaseProperties];
  const baseFieldIds = new Set(taxonomyConfig.baseProperties.definitions.map((definition) => definition.id));
  const existingCustomFieldIds = new Set([
    ...baseFieldIds,
    ...(taxonomyConfig.customFields?.definitions.map((field: CustomFieldDefinition) => field.id) || []),
  ]);

  const newCustomFields = [
    ...(taxonomyConfig.customFields?.definitions || []).filter((field) => !baseFieldIds.has(field.id)),
    ...template.customFields.filter((field) => !existingCustomFieldIds.has(field.id)),
  ];
  const templateRootFieldIds = template.customFields.map((field) => field.id);
  const templateKnownFieldIds = new Set(propertyTreeIds(template.customFields));
  const globalTemplateFieldIds = templateRootFieldIds.filter((id) =>
    Object.values(template.typeProperties ?? {}).every((properties) => properties.includes(id)),
  );
  const existingEntityTypeIds = new Set(taxonomyConfig.entityTypes.definitions.map((definition) => definition.id));
  const mergedEntityTypes = [
    ...taxonomyConfig.entityTypes.definitions,
    ...(template.entityTypes ?? []).filter((definition) => !existingEntityTypeIds.has(definition.id)),
  ];

  return unwrapWorldbuildingDetailsGroup({
    ...taxonomyConfig,
    baseProperties: {
      ...taxonomyConfig.baseProperties,
      visibleByDefault: newVisibleByDefault,
      order: [...newVisibleByDefault],
    },
    entityTypes: template.typeProperties
      ? {
          ...taxonomyConfig.entityTypes,
          definitions: mergedEntityTypes.map((definition) => {
            const typePropertyIds = template.typeProperties?.[definition.id];
            if (!typePropertyIds) return definition;
            const customFields = typePropertyIds.filter((id) => templateRootFieldIds.includes(id));
            return {
              ...definition,
              customFields,
              visibleProperties: typePropertyIds.filter((id) => template.visibleBaseProperties.includes(id)),
              propertyOrder: typePropertyIds,
            };
          }),
        }
      : {
          ...taxonomyConfig.entityTypes,
          definitions: mergedEntityTypes,
        },
    customFields: {
      definitions: newCustomFields,
      globalFields: [
        ...new Set([
          ...(taxonomyConfig.customFields?.globalFields || []).filter((id) => !baseFieldIds.has(id)),
          ...(template.typeProperties ? globalTemplateFieldIds : templateRootFieldIds),
        ]),
      ].filter((id) => templateKnownFieldIds.has(id) || newCustomFields.some((field) => field.id === id)),
    },
  });
}

/**
 * Get a template by ID.
 */
export function getTemplateById(templateId: string): PropertyTemplate | undefined {
  return PROPERTY_TEMPLATES.find((template) => template.id === templateId);
}
