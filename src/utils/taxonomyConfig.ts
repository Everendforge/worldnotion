import type {
  BasePropertyDefinition,
  CustomFieldDefinition,
  CustomFieldType,
  EntityTypeDefinition,
  PropertyDefinition,
  StatusDefinition,
  TagHierarchyNode,
  TaxonomyConfig,
} from "../editorTypes";

export type TaxonomyEntityInput = {
  type: string;
  status: string;
  tags: string[];
  customProperties: Record<string, unknown>;
};

const SPEC_ENTITY_TYPE_IDS = [
  "character",
  "location",
  "organization",
  "event",
  "concept",
  "item",
  "world",
  "cycle",
  "universe",
  "story",
  "arc",
  "scene",
  "quest",
];
const PROTECTED_BASE_PROPERTY_IDS = ["id", "name", "type", "status", "tags", "aliases", "parentId", "childrenIds"] as const;
const VISIBLE_CORE_PROPERTY_IDS = ["type", "status", "aliases"] as const;
const NON_PROPERTY_FIELD_IDS = new Set(["folder", "tags"]);
export const WORLDBUILDING_DETAILS_GROUP_ID = "worldbuilding-details";

function createCoreBaseProperties(): BasePropertyDefinition[] {
  return [
    {
      id: "id",
      label: "ID",
      description: "Unique identifier",
      type: "text",
      immutable: true,
      readOnly: true,
      required: true,
      order: 0,
    },
    {
      id: "name",
      label: "Name",
      description: "Entity name",
      type: "text",
      immutable: true,
      required: true,
      order: 1,
    },
    {
      id: "type",
      label: "Type",
      description: "Entity type",
      type: "select",
      immutable: true,
      required: true,
      order: 2,
    },
    {
      id: "status",
      label: "Status",
      description: "Canon or editorial state",
      type: "select",
      immutable: true,
      required: true,
      order: 3,
    },
    {
      id: "tags",
      label: "Tags",
      description: "Search and grouping labels",
      type: "text",
      immutable: true,
      order: 4,
    },
    {
      id: "aliases",
      label: "Aliases",
      description: "Alternate display names or wikilink candidates",
      type: "text",
      immutable: true,
      order: 5,
    },
    {
      id: "parentId",
      label: "Parent",
      description: "Stable ID of a parent entity",
      type: "entity-ref",
      immutable: true,
      targetTypes: SPEC_ENTITY_TYPE_IDS,
      order: 6,
    },
    {
      id: "childrenIds",
      label: "Children",
      description: "Stable IDs of explicit child entities",
      type: "entity-ref-list",
      immutable: true,
      targetTypes: SPEC_ENTITY_TYPE_IDS,
      order: 7,
    },
  ];
}

export function normalizeCoreBaseProperties(config: TaxonomyConfig): TaxonomyConfig {
  const coreDefinitions = createCoreBaseProperties();
  const allowedIds = new Set<string>(PROTECTED_BASE_PROPERTY_IDS);
  const existingBaseDefinitions = config.baseProperties?.definitions ?? [];
  const movableDefinitions: CustomFieldDefinition[] = existingBaseDefinitions
    .filter((definition) => !allowedIds.has(definition.id))
    .filter((definition) => !NON_PROPERTY_FIELD_IDS.has(definition.id))
    .map((definition) => {
      const { immutable: _immutable, readOnly: _readOnly, order: _order, hidden: _hidden, ...customDefinition } = definition;
      return {
        ...customDefinition,
        label: customDefinition.label ?? definition.id,
      };
    });
  const existingCustomIds = new Set(config.customFields.definitions.map((definition) => definition.id));
  const nextCustomDefinitions = [
    ...config.customFields.definitions.filter((definition) => !NON_PROPERTY_FIELD_IDS.has(definition.id) && !allowedIds.has(definition.id)),
    ...movableDefinitions.filter((definition) => !existingCustomIds.has(definition.id)),
  ];
  const previousVisible = config.baseProperties?.visibleByDefault ?? [...VISIBLE_CORE_PROPERTY_IDS];
  const visibleCore = previousVisible.filter((id) => allowedIds.has(id));
  const visibleCustom = previousVisible.filter((id) => !allowedIds.has(id) && !NON_PROPERTY_FIELD_IDS.has(id));

  return unwrapWorldbuildingDetailsGroup({
    ...config,
    baseProperties: {
      definitions: coreDefinitions,
      visibleByDefault: visibleCore.length ? visibleCore.filter((id) => id !== "folder") : [...VISIBLE_CORE_PROPERTY_IDS],
      order: [...PROTECTED_BASE_PROPERTY_IDS],
    },
    customFields: {
      ...config.customFields,
      definitions: nextCustomDefinitions,
      globalFields: [...new Set([...(config.customFields.globalFields ?? []), ...visibleCustom])].filter(
        (id) => !NON_PROPERTY_FIELD_IDS.has(id) && !allowedIds.has(id),
      ),
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => ({
        ...definition,
        customFields: definition.customFields?.filter((id) => !allowedIds.has(id)),
      })),
    },
  });
}

function propertyAppliesToType(property: PropertyDefinition, entityType: string): boolean {
  const typeCondition = property.visibleWhen?.type;
  return !typeCondition || typeCondition.includes(entityType);
}

function replaceWorldbuildingDetailIds(
  ids: string[] | undefined,
  children: PropertyDefinition[],
  entityType?: string,
): string[] | undefined {
  if (!ids) return ids;
  const replacementIds = entityType
    ? children
        .filter((child) => propertyAppliesToType(child, entityType))
        .map((child) => child.id)
    : [];
  const next: string[] = [];
  ids.forEach((id) => {
    if (id === WORLDBUILDING_DETAILS_GROUP_ID) {
      next.push(...replacementIds);
      return;
    }
    next.push(id);
  });
  return next.filter((id, index) => next.indexOf(id) === index);
}

export function unwrapWorldbuildingDetailsGroup(config: TaxonomyConfig): TaxonomyConfig {
  const group = config.customFields.definitions.find(
    (definition) => definition.id === WORLDBUILDING_DETAILS_GROUP_ID && definition.type === "group",
  );
  if (!group?.children?.length) return config;
  const groupChildren = group.children;

  const rootDefinitions = config.customFields.definitions.filter((definition) => definition.id !== WORLDBUILDING_DETAILS_GROUP_ID);
  const rootIds = new Set(rootDefinitions.map((definition) => definition.id));
  const childrenToLift = groupChildren
    .filter((child) => !rootIds.has(child.id))
    .map((child) => ({ ...child })) as CustomFieldDefinition[];
  const groupIndex = config.customFields.definitions.findIndex((definition) => definition.id === WORLDBUILDING_DETAILS_GROUP_ID);
  const nextDefinitions = [
    ...rootDefinitions.slice(0, Math.max(groupIndex, 0)),
    ...childrenToLift,
    ...rootDefinitions.slice(Math.max(groupIndex, 0)),
  ];

  return {
    ...config,
    customFields: {
      ...config.customFields,
      definitions: nextDefinitions,
      globalFields: replaceWorldbuildingDetailIds(config.customFields.globalFields, groupChildren) ?? config.customFields.globalFields,
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => ({
        ...definition,
        customFields: replaceWorldbuildingDetailIds(definition.customFields, groupChildren, definition.id),
        visibleProperties: replaceWorldbuildingDetailIds(definition.visibleProperties, groupChildren, definition.id),
        propertyOrder: replaceWorldbuildingDetailIds(definition.propertyOrder, groupChildren, definition.id),
      })),
    },
  };
}

export function createDefaultTaxonomyConfig(): TaxonomyConfig {
  return {
    version: "1.0",
    baseProperties: {
      definitions: createCoreBaseProperties(),
      visibleByDefault: [...VISIBLE_CORE_PROPERTY_IDS],
      order: [...PROTECTED_BASE_PROPERTY_IDS],
    },
    tags: {
      rootNodes: [],
      allowCustomTags: true,
      autoDetectSlashNotation: true,
    },
    contentTypes: {
      definitions: [
        {
          id: "folder-description",
          label: "Folder Note",
          description: "Special note that describes a folder",
          icon: "folder",
          color: "#64748b",
          immutable: true,
        },
      ],
    },
    entityTypes: {
      definitions: [
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
          id: "concept",
          label: "Concept",
          description: "Idea, law, magic rule, or abstract note",
          icon: "lightbulb",
          color: "#8b5cf6",
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
      ],
      defaultType: "concept",
      allowCustomTypes: true,
    },
    statuses: {
      definitions: [
        {
          id: "draft",
          label: "Draft",
          description: "Work in progress",
          color: "#6b7280",
          order: 0,
        },
        {
          id: "in-progress",
          label: "In Progress",
          description: "Actively being worked on",
          color: "#f59e0b",
          order: 1,
        },
        {
          id: "review",
          label: "Review",
          description: "Ready for review",
          color: "#3b82f6",
          order: 2,
        },
        {
          id: "published",
          label: "Published",
          description: "Finalized and approved",
          color: "#10b981",
          order: 3,
        },
        {
          id: "archived",
          label: "Archived",
          description: "No longer active",
          color: "#6b7280",
          order: 4,
        },
      ],
      defaultStatus: "draft",
      allowCustomStatuses: true,
    },
    customFields: {
      definitions: [],
      globalFields: [],
    },
  };
}

function buildTagHierarchy(tags: string[]): TagHierarchyNode[] {
  const rootMap = new Map<string, TagHierarchyNode>();

  tags.forEach((tag) => {
    const parts = tag.split("/");
    let currentPath = "";

    parts.forEach((part, index) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (index === 0) {
        if (!rootMap.has(currentPath)) {
          rootMap.set(currentPath, {
            id: `tag-${currentPath}`,
            label: part,
            fullPath: currentPath,
            children: [],
          });
        }
      } else {
        const findAndAddChild = (nodes: TagHierarchyNode[]): boolean => {
          for (const node of nodes) {
            if (node.fullPath === parentPath) {
              const existing = node.children.find((child) => child.fullPath === currentPath);
              if (!existing) {
                node.children.push({
                  id: `tag-${currentPath}`,
                  label: part,
                  fullPath: currentPath,
                  children: [],
                  parentId: node.id,
                });
              }
              return true;
            }
            if (findAndAddChild(node.children)) return true;
          }
          return false;
        };

        findAndAddChild(Array.from(rootMap.values()));
      }
    });
  });

  return Array.from(rootMap.values());
}

export function generateTaxonomyFromEntities(entities: TaxonomyEntityInput[]): TaxonomyConfig {
  const tagSet = new Set<string>();
  const typeSet = new Set<string>();
  const statusSet = new Set<string>();
  const propertyFrequency = new Map<string, number>();
  const propertyExamples = new Map<string, Set<unknown>>();

  entities.forEach((entity) => {
    entity.tags.forEach((tag) => tagSet.add(tag));
    if (entity.type) typeSet.add(entity.type);
    if (entity.status) statusSet.add(entity.status);

    Object.entries(entity.customProperties).forEach(([key, value]) => {
      propertyFrequency.set(key, (propertyFrequency.get(key) || 0) + 1);
      if (!propertyExamples.has(key)) {
        propertyExamples.set(key, new Set());
      }
      propertyExamples.get(key)!.add(value);
    });
  });

  const entityTypeDefinitions: EntityTypeDefinition[] = Array.from(typeSet)
    .filter((type) => type !== "")
    .map((type) => ({
      id: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      customFields: [],
    }));

  const statusDefinitions: StatusDefinition[] = Array.from(statusSet)
    .filter((status) => status !== "")
    .map((status, index) => ({
      id: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      order: index,
    }));

  const threshold = Math.max(3, Math.floor(entities.length * 0.1));
  const customFieldDefinitions: CustomFieldDefinition[] = Array.from(propertyFrequency.entries())
    .filter(([, count]) => count >= threshold)
    .map(([key]) => {
      const examples = Array.from(propertyExamples.get(key) || []);

      let fieldType: CustomFieldType = "text";
      if (examples.every((value) => typeof value === "boolean")) {
        fieldType = "boolean";
      } else if (examples.every((value) => typeof value === "number")) {
        fieldType = "number";
      } else if (examples.every((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(String(value)))) {
        fieldType = "date";
      } else if (examples.length <= 10 && examples.every((value) => typeof value === "string")) {
        fieldType = "select";
      }

      return {
        id: key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1"),
        type: fieldType,
        ...(fieldType === "select" && {
          options: examples.map((value) => ({
            label: String(value),
            value: String(value),
          })),
        }),
      };
    });

  return {
    version: "1.0",
    tags: {
      rootNodes: buildTagHierarchy(Array.from(tagSet)),
      allowCustomTags: true,
      autoDetectSlashNotation: true,
    },
    entityTypes: {
      definitions: entityTypeDefinitions.length > 0 ? entityTypeDefinitions : createDefaultTaxonomyConfig().entityTypes.definitions,
      defaultType: entityTypeDefinitions.length > 0 ? entityTypeDefinitions[0].id : "concept",
      allowCustomTypes: true,
    },
    statuses: {
      definitions: statusDefinitions.length > 0 ? statusDefinitions : createDefaultTaxonomyConfig().statuses.definitions,
      defaultStatus: statusDefinitions.length > 0 ? statusDefinitions[0].id : "draft",
      allowCustomStatuses: true,
    },
    customFields: {
      definitions: customFieldDefinitions,
      globalFields: customFieldDefinitions.map((field) => field.id),
    },
  };
}

export function mergeTagHierarchy(predefinedTags: TagHierarchyNode[], detectedTags: string[]): TagHierarchyNode[] {
  const tagMap = new Map<string, TagHierarchyNode>();

  const addToMap = (node: TagHierarchyNode) => {
    tagMap.set(node.fullPath, node);
    node.children.forEach(addToMap);
  };
  predefinedTags.forEach(addToMap);

  detectedTags.forEach((tag) => {
    if (tag.includes("/")) {
      const parts = tag.split("/").filter(Boolean);
      let currentPath = "";
      let parentId: string | undefined;

      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!tagMap.has(currentPath)) {
          const newNode: TagHierarchyNode = {
            id: currentPath.replace(/\//g, "-"),
            label: part,
            fullPath: currentPath,
            children: [],
            parentId,
          };

          tagMap.set(currentPath, newNode);

          if (parentId) {
            const parent = Array.from(tagMap.values()).find((node) => node.id === parentId);
            if (parent && !parent.children.some((child) => child.id === newNode.id)) {
              parent.children.push(newNode);
            }
          }
        }

        parentId = currentPath.replace(/\//g, "-");
      });
    }
  });

  return Array.from(tagMap.values()).filter((node) => !node.parentId);
}

/**
 * Migrate legacy taxonomy config to new property system
 * Detects taxonomies without baseProperties and adds them with defaults
 * Also migrates folder-description from entityTypes to contentTypes
 * This is a one-way migration - once migrated, cannot go back to legacy format
 */
export function migrateTaxonomyConfig(config: TaxonomyConfig): TaxonomyConfig {
  let needsMigration = false;
  const migratedConfig = { ...config };

  // Check if baseProperties migration is needed
  if (!config.baseProperties) {
    console.log("[Migration] Migrating legacy taxonomy config to property system");
    needsMigration = true;

    migratedConfig.baseProperties = {
      definitions: createCoreBaseProperties(),
      visibleByDefault: [...VISIBLE_CORE_PROPERTY_IDS],
      order: [...PROTECTED_BASE_PROPERTY_IDS],
    };
    migratedConfig.version = "1.0";
  }

  // Check if contentTypes migration is needed
  if (!config.contentTypes) {
    console.log("[Migration] Creating contentTypes section");
    needsMigration = true;

    // Create contentTypes with folder-description
    migratedConfig.contentTypes = {
      definitions: [
        {
          id: "folder-description",
          label: "Folder Note",
          description: "Special note that describes a folder",
          icon: "folder",
          color: "#64748b",
          immutable: true,
        },
      ],
    };

    // Check if folder-description exists in entityTypes and remove it
    if (migratedConfig.entityTypes?.definitions) {
      const folderDescIndex = migratedConfig.entityTypes.definitions.findIndex(
        (def) => def.id === "folder-description"
      );
      if (folderDescIndex >= 0) {
        console.log("[Migration] Moving folder-description from entityTypes to contentTypes");
        migratedConfig.entityTypes.definitions.splice(folderDescIndex, 1);
      }
    }
  }

  if (needsMigration) {
    console.log("[Migration] Migration completed successfully");
  }

  return migratedConfig;
}

/**
 * Check if a taxonomy config needs migration
 */
export function needsTaxonomyMigration(config: TaxonomyConfig | undefined): boolean {
  if (!config) return false;
  return !config.baseProperties;
}
