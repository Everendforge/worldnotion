import YAML from "yaml";
import type {
  CustomFieldDefinition,
  CustomFieldType,
  PropertiesConfig,
  PropertyDefinition,
} from "../editorTypes";
import { isStructureProperty, type PropertyLayoutSectionKind } from "./propertyLayout";
import { traversePropertyTree } from "./propertyTreeUtils";

export type VisiblePropertyDefinition = PropertyDefinition & { source: "base" | "custom" };
export type PropertyParentTarget = string | null | undefined;
export type InspectorPropertySectionId = PropertyLayoutSectionKind;
export type InspectorPropertyTreeNode = {
  property: VisiblePropertyDefinition;
  depth: number;
  parentId?: string;
  path: string[];
  visibleInType: boolean;
  conditionActive: boolean;
  conditionLabel?: string;
  children: InspectorPropertyTreeNode[];
};

export type InspectorPropertySection = {
  id: string;
  kind: InspectorPropertySectionId;
  title: string;
  rootId?: string;
  nodes: InspectorPropertyTreeNode[];
};

export type PropertySchemaSectionId = PropertyLayoutSectionKind;
export type PropertySchemaTreeNode = InspectorPropertyTreeNode;
export type PropertySchemaSection = {
  id: string;
  kind: PropertySchemaSectionId;
  title: string;
  rootId?: string;
  nodes: PropertySchemaTreeNode[];
};

export type UnconfiguredProperty = {
  key: string;
  value: unknown;
  inferredType: CustomFieldType;
};

const BASE_FRONTMATTER_KEYS = [
  "id",
  "type",
  "name",
  "status",
  "tags",
  "aliases",
  "parentId",
  "childrenIds",
  "folder",
];
export const SYSTEM_FRONTMATTER_KEYS = new Set(["folder"]);
export const NON_INSPECTOR_PROPERTY_IDS = new Set(["folder", "tags"]);
const BASE_INSPECTOR_PROPERTY_IDS = new Set(["id", "name", "type", "status", "aliases"]);

// System property comment for folder field
const FOLDER_SYSTEM_PROPERTY_COMMENT =
  "Don't delete; it's a WorldNotion system property: indicates whether this note corresponds to a folder.";

export function knownPropertyIds(config?: PropertiesConfig): Set<string> {
  const ids = new Set<string>(BASE_FRONTMATTER_KEYS);
  flattenPropertyDefinitions(config?.baseProperties?.definitions ?? []).forEach((property) =>
    ids.add(property.id),
  );
  flattenPropertyDefinitions(config?.customFields.definitions ?? []).forEach((property) =>
    ids.add(property.id),
  );
  return ids;
}

function uniqueInOrder(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

export function uniquePropertyId(label: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  const baseId = sanitizePropertyId(label) || "property";
  if (!existing.has(baseId)) return baseId;
  let index = 2;
  while (existing.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

export function getTypeDefinition(
  config: PropertiesConfig | undefined,
  entityType: string | undefined,
) {
  return entityType
    ? config?.entityTypes.definitions.find((candidate) => candidate.id === entityType)
    : undefined;
}

export function listVisibleProperties(
  config?: PropertiesConfig,
  entityType?: string,
): VisiblePropertyDefinition[] {
  if (!config?.baseProperties) return [];
  const typeDefinition = getTypeDefinition(config, entityType);
  const baseVisible = typeDefinition?.visibleProperties?.length
    ? typeDefinition.visibleProperties
    : (config.baseProperties.visibleByDefault ?? ["id", "name", "type", "status", "tags"]);
  const customVisible = [
    ...(config.customFields.globalFields ?? []),
    ...(typeDefinition?.customFields ?? []),
  ];
  const visibleIds = new Set([...baseVisible, ...customVisible]);
  const hiddenIds = new Set(typeDefinition?.hiddenProperties ?? []);
  const order = uniqueInOrder([
    ...(typeDefinition?.propertyOrder ?? config.baseProperties.order ?? []),
    ...customVisible,
  ]);

  const properties: VisiblePropertyDefinition[] = [
    ...config.baseProperties.definitions.map((property) => ({
      ...property,
      source: "base" as const,
    })),
    ...config.customFields.definitions
      .filter(
        (property) =>
          !config.baseProperties?.definitions.some(
            (baseProperty) => baseProperty.id === property.id,
          ),
      )
      .map((property) => ({ ...property, source: "custom" as const })),
  ].filter(
    (property) =>
      visibleIds.has(property.id) &&
      !hiddenIds.has(property.id) &&
      !NON_INSPECTOR_PROPERTY_IDS.has(property.id) &&
      !("hidden" in property && property.hidden),
  );

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
    ...flattenPropertyDefinitions(config.baseProperties.definitions).map((property) => ({
      ...property,
      source: "base" as const,
    })),
    ...flattenPropertyDefinitions(config.customFields.definitions)
      .filter(
        (property) =>
          !config.baseProperties?.definitions.some(
            (baseProperty) => baseProperty.id === property.id,
          ),
      )
      .map((property) => ({ ...property, source: "custom" as const })),
  ];
}

export function listInspectableProperties(config?: PropertiesConfig): VisiblePropertyDefinition[] {
  return listAllProperties(config).filter(
    (property) => !NON_INSPECTOR_PROPERTY_IDS.has(property.id),
  );
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

export function addPropertyToConfig(
  config: PropertiesConfig,
  property: CustomFieldDefinition,
): PropertiesConfig {
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

function mapPropertyDefinitions(
  definitions: PropertyDefinition[],
  propertyId: string,
  mapper: (property: PropertyDefinition) => PropertyDefinition,
): PropertyDefinition[] {
  return definitions.map((definition) => {
    if (definition.id === propertyId) return mapper(definition);
    if (definition.children?.length) {
      return {
        ...definition,
        children: mapPropertyDefinitions(definition.children, propertyId, mapper),
      };
    }
    return definition;
  });
}

function removePropertyDefinitions(
  definitions: PropertyDefinition[],
  propertyId: string,
): PropertyDefinition[] {
  return definitions
    .filter((definition) => definition.id !== propertyId)
    .map((definition) => ({
      ...definition,
      children: definition.children
        ? removePropertyDefinitions(definition.children, propertyId)
        : undefined,
    }));
}

function definitionTreeContains(definitions: PropertyDefinition[], propertyId: string): boolean {
  return flattenPropertyDefinitions(definitions).some((definition) => definition.id === propertyId);
}

function findDefinitionInTree(
  definitions: PropertyDefinition[],
  propertyId: string,
): PropertyDefinition | undefined {
  for (const definition of definitions) {
    if (definition.id === propertyId) return definition;
    if (definition.children?.length) {
      const child = findDefinitionInTree(definition.children, propertyId);
      if (child) return child;
    }
  }
  return undefined;
}

function conditionLabelForProperty(
  property: PropertyDefinition,
  allProperties: VisiblePropertyDefinition[],
): string | undefined {
  if (!property.visibleWhen) return undefined;
  return Object.entries(property.visibleWhen)
    .map(([parentId, values]) => {
      const parent = allProperties.find((candidate) => candidate.id === parentId);
      return `Depends on ${parent?.label ?? parentId} = ${values.join(" or ")}`;
    })
    .join(", ");
}

function conditionIsActive(property: PropertyDefinition, values: Record<string, unknown>): boolean {
  if (!property.visibleWhen) return true;
  return Object.entries(property.visibleWhen).every(([parentId, allowedValues]) => {
    const currentValue = values[parentId];
    if (Array.isArray(currentValue)) {
      return currentValue.some((value) => allowedValues.includes(String(value)));
    }
    return allowedValues.includes(String(currentValue));
  });
}

function collectDefinitionTreeIds(
  definitions: PropertyDefinition[],
  ids = new Set<string>(),
): Set<string> {
  definitions.forEach((definition) => {
    ids.add(definition.id);
    if (definition.children?.length) {
      collectDefinitionTreeIds(definition.children, ids);
    }
  });
  return ids;
}

function collectNodeTreeIds(
  nodes: InspectorPropertyTreeNode[],
  ids = new Set<string>(),
): Set<string> {
  nodes.forEach((node) => {
    ids.add(node.property.id);
    if (node.children.length) {
      collectNodeTreeIds(node.children, ids);
    }
  });
  return ids;
}

function hasInspectorChildren(property: PropertyDefinition): boolean {
  return Boolean(property.children?.some((child) => !NON_INSPECTOR_PROPERTY_IDS.has(child.id)));
}

function splitRootSections(
  nodes: InspectorPropertyTreeNode[],
  hiddenTitle = "HIDDEN",
): InspectorPropertySection[] {
  const structureNodes = nodes.filter((node) => isStructureProperty(node.property));
  const mainNodes = nodes.filter(
    (node) =>
      !isStructureProperty(node.property) &&
      (node.property.source === "base" || !hasInspectorChildren(node.property)),
  );
  const rootSections = nodes
    .filter(
      (node) =>
        !isStructureProperty(node.property) &&
        node.property.source === "custom" &&
        hasInspectorChildren(node.property),
    )
    .map((node) => ({
      id: `root:${node.property.id}`,
      kind: "root" as const,
      title: (node.property.label ?? node.property.id).toUpperCase(),
      rootId: node.property.id,
      nodes: [node],
    }));

  return [
    { id: "main", kind: "main", title: "MAIN", nodes: mainNodes },
    { id: "structure", kind: "structure", title: "STRUCTURE", nodes: structureNodes },
    ...rootSections,
    { id: "hidden", kind: "hidden", title: hiddenTitle, nodes: [] },
  ];
}

function toTreeNode(
  property: VisiblePropertyDefinition,
  allProperties: VisiblePropertyDefinition[],
  visibleIds: Set<string>,
  hiddenIds: Set<string>,
  values: Record<string, unknown>,
  depth: number,
  parentId: string | undefined,
  path: string[],
): InspectorPropertyTreeNode {
  const nextPath = [...path, property.id];
  const children = (property.children ?? [])
    .filter((child) => !NON_INSPECTOR_PROPERTY_IDS.has(child.id))
    .map((child) => {
      const source =
        allProperties.find((candidate) => candidate.id === child.id)?.source ?? property.source;
      return toTreeNode(
        { ...child, source } as VisiblePropertyDefinition,
        allProperties,
        visibleIds,
        hiddenIds,
        values,
        depth + 1,
        property.id,
        nextPath,
      );
    });

  return {
    property,
    depth,
    parentId,
    path: nextPath,
    visibleInType: visibleIds.has(property.id) && !hiddenIds.has(property.id),
    conditionActive: conditionIsActive(property, values),
    conditionLabel: conditionLabelForProperty(property, allProperties),
    children,
  };
}

export function buildInspectorPropertySections(
  config: PropertiesConfig | undefined,
  entityType: string | undefined,
  values: Record<string, unknown> = {},
  options: { includeHidden?: boolean; includeInactiveConditions?: boolean } = {},
): InspectorPropertySection[] {
  if (!config?.baseProperties) {
    return [
      { id: "main", kind: "main", title: "MAIN", nodes: [] },
      { id: "hidden", kind: "hidden", title: "HIDDEN", nodes: [] },
    ];
  }

  const allProperties = listAllProperties(config);
  const visibleRoots = listVisibleProperties(config, entityType);
  const visibleIds = collectDefinitionTreeIds(visibleRoots);
  const hiddenIds = new Set(getTypeDefinition(config, entityType)?.hiddenProperties ?? []);
  const visibleNodes = visibleRoots
    .map((property) =>
      toTreeNode(property, allProperties, visibleIds, hiddenIds, values, 0, undefined, []),
    )
    .map((node) =>
      filterTreeNode(
        node,
        options.includeInactiveConditions ?? false,
        options.includeHidden ?? false,
      ),
    )
    .filter((node): node is InspectorPropertyTreeNode => Boolean(node));
  const renderedIds = collectNodeTreeIds(visibleNodes);
  const hiddenNodes = options.includeHidden
    ? allProperties
        .filter(
          (property) =>
            !renderedIds.has(property.id) && !NON_INSPECTOR_PROPERTY_IDS.has(property.id),
        )
        .map((property) =>
          toTreeNode(property, allProperties, visibleIds, hiddenIds, values, 0, undefined, []),
        )
    : [];
  const sections = splitRootSections(
    visibleNodes.map((node) =>
      BASE_INSPECTOR_PROPERTY_IDS.has(node.property.id)
        ? { ...node, property: { ...node.property, source: "base" as const } }
        : node,
    ),
  );
  const hiddenSection = sections.find((section) => section.kind === "hidden");
  if (hiddenSection) {
    hiddenSection.nodes = hiddenNodes;
  }

  return sections.filter(
    (section) => section.kind !== "hidden" || options.includeHidden || section.nodes.length > 0,
  );
}

export function buildPropertySchemaSections(
  config: PropertiesConfig | undefined,
  entityType: string | undefined,
  options: { includeHidden?: boolean } = { includeHidden: true },
): PropertySchemaSection[] {
  if (!config?.baseProperties) {
    return [
      { id: "main", kind: "main", title: "MAIN", nodes: [] },
      { id: "hidden", kind: "hidden", title: "HIDDEN", nodes: [] },
    ];
  }

  const typeDefinition = getTypeDefinition(config, entityType);
  const allProperties = listAllProperties(config);
  const hiddenIds = new Set(typeDefinition?.hiddenProperties ?? []);
  const visibleRoots = listVisibleProperties(config, entityType);
  const visibleIds = collectDefinitionTreeIds(visibleRoots);
  const roots = [
    ...config.baseProperties.definitions
      .filter((property) => !NON_INSPECTOR_PROPERTY_IDS.has(property.id))
      .map((property) => ({ ...property, source: "base" as const })),
    ...config.customFields.definitions
      .filter(
        (property) =>
          !config.baseProperties?.definitions.some(
            (baseProperty) => baseProperty.id === property.id,
          ),
      )
      .filter((property) => !NON_INSPECTOR_PROPERTY_IDS.has(property.id))
      .map((property) => ({ ...property, source: "custom" as const })),
  ];
  const order = getConfiguredFrontmatterOrder(
    config,
    entityType,
    roots.map((property) => property.id),
  );
  const orderedRoots = [...roots].sort((first, second) => {
    const firstIndex = order.indexOf(first.id);
    const secondIndex = order.indexOf(second.id);
    if (firstIndex === -1 && secondIndex === -1) {
      return (first.label ?? first.id).localeCompare(second.label ?? second.id);
    }
    if (firstIndex === -1) return 1;
    if (secondIndex === -1) return -1;
    return firstIndex - secondIndex;
  });
  const rootNodes = orderedRoots.map((property) =>
    toTreeNode(
      property,
      allProperties,
      visibleIds,
      hiddenIds,
      { type: entityType },
      0,
      undefined,
      [],
    ),
  );
  const visibleRootNodes = rootNodes.filter((node) => node.visibleInType);
  const hiddenRootNodes = rootNodes.filter((node) => !node.visibleInType);
  const sections = splitRootSections(visibleRootNodes, "HIDDEN") as PropertySchemaSection[];
  const hiddenSection = sections.find((section) => section.kind === "hidden");
  if (hiddenSection) {
    hiddenSection.nodes = options.includeHidden === false ? [] : hiddenRootNodes;
  }

  return sections.filter((section) => section.kind !== "hidden" || section.nodes.length > 0);
}

function filterTreeNode(
  node: InspectorPropertyTreeNode,
  includeInactiveConditions: boolean,
  includeHidden: boolean,
): InspectorPropertyTreeNode | null {
  if (!includeInactiveConditions && !node.conditionActive) return null;
  if (!includeHidden && !node.visibleInType) return null;
  const children = node.children
    .map((child) => filterTreeNode(child, includeInactiveConditions, includeHidden))
    .filter((child): child is InspectorPropertyTreeNode => Boolean(child));
  return { ...node, children };
}

function findDefinitionWithSource(
  config: PropertiesConfig,
  propertyId: string,
): { definition: PropertyDefinition; source: "base" | "custom" } | undefined {
  const base = findDefinitionInTree(config.baseProperties?.definitions ?? [], propertyId);
  if (base) return { definition: base, source: "base" };
  const custom = findDefinitionInTree(config.customFields.definitions ?? [], propertyId);
  if (custom) return { definition: custom, source: "custom" };
  return undefined;
}

function expandPropertyOrderIds(config: PropertiesConfig | undefined, ids: string[]): string[] {
  const roots = [
    ...(config?.baseProperties?.definitions ?? []),
    ...(config?.customFields.definitions ?? []),
  ];
  return ids.flatMap((id) => {
    const definition = findDefinitionInTree(roots, id);
    if (!definition?.children?.length) return [id];
    return [id, ...flattenPropertyDefinitions(definition.children).map((child) => child.id)];
  });
}

function reorderSiblingDefinitions(
  definitions: PropertyDefinition[],
  draggedId: string,
  targetId: string,
): { definitions: PropertyDefinition[]; changed: boolean } {
  const siblingIds = definitions.map((definition) => definition.id);
  if (siblingIds.includes(draggedId) && siblingIds.includes(targetId)) {
    const withoutDragged = definitions.filter((definition) => definition.id !== draggedId);
    const dragged = definitions.find((definition) => definition.id === draggedId);
    const targetIndex = withoutDragged.findIndex((definition) => definition.id === targetId);
    if (!dragged || targetIndex === -1) return { definitions, changed: false };
    return {
      definitions: [
        ...withoutDragged.slice(0, targetIndex),
        dragged,
        ...withoutDragged.slice(targetIndex),
      ],
      changed: true,
    };
  }

  let changed = false;
  const nextDefinitions = definitions.map((definition) => {
    if (!definition.children?.length) return definition;
    const result = reorderSiblingDefinitions(definition.children, draggedId, targetId);
    if (!result.changed) return definition;
    changed = true;
    return { ...definition, children: result.definitions };
  });
  return { definitions: nextDefinitions, changed };
}

function ensureTypePropertyMembership(
  config: PropertiesConfig,
  entityType: string | undefined,
  propertyIds: string[],
): PropertiesConfig {
  const ids = uniqueInOrder(propertyIds.filter((id) => !NON_INSPECTOR_PROPERTY_IDS.has(id)));
  if (!entityType) {
    return {
      ...config,
      customFields: {
        ...config.customFields,
        globalFields: uniqueInOrder([...(config.customFields.globalFields ?? []), ...ids]),
      },
    };
  }

  return {
    ...config,
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => {
        if (definition.id !== entityType) return definition;
        return {
          ...definition,
          customFields: uniqueInOrder([...(definition.customFields ?? []), ...ids]),
          propertyOrder: uniqueInOrder([...(definition.propertyOrder ?? []), ...ids]),
        };
      }),
    },
  };
}

export function upsertInspectorProperty(
  config: PropertiesConfig,
  property: CustomFieldDefinition,
  entityType?: string,
  parentId?: string,
): PropertiesConfig {
  const customDefinitions = config.customFields.definitions ?? [];
  const baseDefinitions = config.baseProperties?.definitions ?? [];
  const existsInCustom = definitionTreeContains(customDefinitions, property.id);
  const existsInBase = definitionTreeContains(baseDefinitions, property.id);

  if (parentId) {
    const child = {
      ...property,
      children: property.children?.length ? property.children : undefined,
    };
    let nextConfig = {
      ...config,
      customFields: {
        ...config.customFields,
        definitions: removePropertyDefinitions(
          customDefinitions,
          property.id,
        ) as CustomFieldDefinition[],
      },
      baseProperties: config.baseProperties
        ? {
            ...config.baseProperties,
            definitions: removePropertyDefinitions(
              baseDefinitions,
              property.id,
            ) as typeof baseDefinitions,
          }
        : config.baseProperties,
    };

    const parentInCustom = definitionTreeContains(nextConfig.customFields.definitions, parentId);
    if (parentInCustom) {
      nextConfig = {
        ...nextConfig,
        customFields: {
          ...nextConfig.customFields,
          definitions: mapPropertyDefinitions(
            nextConfig.customFields.definitions,
            parentId,
            (parent) => ({
              ...parent,
              children: [
                ...(parent.children ?? []).filter((candidate) => candidate.id !== property.id),
                child,
              ],
            }),
          ) as CustomFieldDefinition[],
        },
      };
    } else if (
      nextConfig.baseProperties &&
      definitionTreeContains(nextConfig.baseProperties.definitions, parentId)
    ) {
      nextConfig = {
        ...nextConfig,
        baseProperties: {
          ...nextConfig.baseProperties,
          definitions: mapPropertyDefinitions(
            nextConfig.baseProperties.definitions,
            parentId,
            (parent) => ({
              ...parent,
              children: [
                ...(parent.children ?? []).filter((candidate) => candidate.id !== property.id),
                child,
              ],
            }),
          ) as typeof nextConfig.baseProperties.definitions,
        },
      };
    }

    return ensureTypePropertyMembership(nextConfig, entityType, [parentId, property.id]);
  }

  const nextDefinitions = existsInCustom
    ? (mapPropertyDefinitions(
        customDefinitions,
        property.id,
        () => property,
      ) as CustomFieldDefinition[])
    : [...customDefinitions, property];

  if (existsInBase && config.baseProperties) {
    return ensureTypePropertyMembership(
      {
        ...config,
        baseProperties: {
          ...config.baseProperties,
          definitions: mapPropertyDefinitions(
            baseDefinitions,
            property.id,
            () => property,
          ) as typeof config.baseProperties.definitions,
        },
      },
      entityType,
      [property.id],
    );
  }

  return ensureTypePropertyMembership(
    {
      ...config,
      customFields: {
        ...config.customFields,
        definitions: nextDefinitions,
      },
    },
    entityType,
    [property.id],
  );
}

export function createInspectorProperty(
  config: PropertiesConfig,
  entityType: string | undefined,
  label: string,
  type: CustomFieldType,
  parentId?: string,
): PropertiesConfig {
  const id = uniquePropertyId(
    label,
    listAllProperties(config).map((property) => property.id),
  );
  return upsertInspectorProperty(
    config,
    {
      id,
      label: label.trim() || labelFromPropertyId(id),
      type,
      required: false,
    },
    entityType,
    parentId,
  );
}

export function setInspectorPropertyVisibility(
  config: PropertiesConfig,
  entityType: string | undefined,
  propertyId: string,
  visible: boolean,
): PropertiesConfig {
  if (!config.baseProperties) return config;
  const isBaseProperty = config.baseProperties.definitions.some(
    (definition) => definition.id === propertyId,
  );
  const currentType = entityType ? getTypeDefinition(config, entityType) : undefined;
  const currentVisibleIds = listVisibleProperties(config, entityType).map(
    (property) => property.id,
  );
  const nextVisibleIds = visible
    ? uniqueInOrder([...currentVisibleIds, propertyId])
    : currentVisibleIds.filter((id) => id !== propertyId);

  return {
    ...config,
    baseProperties: {
      ...config.baseProperties,
      visibleByDefault: entityType
        ? config.baseProperties.visibleByDefault
        : visible && isBaseProperty
          ? uniqueInOrder([...(config.baseProperties.visibleByDefault ?? []), propertyId])
          : (config.baseProperties.visibleByDefault ?? []).filter((id) => id !== propertyId),
    },
    customFields: {
      ...config.customFields,
      globalFields: entityType
        ? config.customFields.globalFields
        : visible && !isBaseProperty
          ? uniqueInOrder([...(config.customFields.globalFields ?? []), propertyId])
          : (config.customFields.globalFields ?? []).filter((id) => id !== propertyId),
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => {
        if (entityType && definition.id !== entityType) return definition;
        if (!entityType) return definition;
        const currentCustomFields = definition.customFields ?? [];
        const nextCustomFields = isBaseProperty
          ? currentCustomFields
          : visible
            ? uniqueInOrder([...currentCustomFields, propertyId])
            : currentCustomFields.filter((id) => id !== propertyId);
        const order = currentType?.propertyOrder ?? currentVisibleIds;
        const nextOrder = visible
          ? uniqueInOrder([...order, propertyId])
          : order.filter((id) => id !== propertyId);
        return {
          ...definition,
          customFields: nextCustomFields,
          visibleProperties: nextVisibleIds,
          hiddenProperties: visible
            ? (definition.hiddenProperties ?? []).filter((id) => id !== propertyId)
            : uniqueInOrder([...(definition.hiddenProperties ?? []), propertyId]),
          propertyOrder: nextOrder,
        };
      }),
    },
  };
}

function appendPropertyToParent(
  definitions: PropertyDefinition[],
  parentId: string,
  property: PropertyDefinition,
): { definitions: PropertyDefinition[]; changed: boolean } {
  let changed = false;
  const nextDefinitions = definitions.map((definition) => {
    if (definition.id === parentId) {
      changed = true;
      return {
        ...definition,
        children: [
          ...(definition.children ?? []).filter((child) => child.id !== property.id),
          property,
        ],
      };
    }
    if (!definition.children?.length) return definition;
    const result = appendPropertyToParent(definition.children, parentId, property);
    if (!result.changed) return definition;
    changed = true;
    return { ...definition, children: result.definitions };
  });
  return { definitions: nextDefinitions, changed };
}

export function moveInspectorProperty(
  config: PropertiesConfig,
  entityType: string | undefined,
  propertyId: string,
  parentId?: PropertyParentTarget,
): PropertiesConfig {
  const found = findDefinitionWithSource(config, propertyId);
  if (!found) return config;
  if ("immutable" in found.definition && found.definition.immutable) return config;
  if (parentId === propertyId) return config;
  const roots = [
    ...(config.baseProperties?.definitions ?? []),
    ...(config.customFields.definitions ?? []),
  ];
  if (parentId) {
    const parentPath = getPropertyPathFromDefinitions(roots, parentId);
    if (parentPath.length === 0) return config;
    if (parentPath.includes(propertyId)) return config;
  }

  const detachedCustom = removePropertyDefinitions(
    config.customFields.definitions,
    propertyId,
  ) as CustomFieldDefinition[];
  const detachedBase = config.baseProperties
    ? (removePropertyDefinitions(
        config.baseProperties.definitions,
        propertyId,
      ) as typeof config.baseProperties.definitions)
    : undefined;

  let nextConfig: PropertiesConfig = {
    ...config,
    customFields: {
      ...config.customFields,
      definitions: detachedCustom,
    },
    baseProperties: config.baseProperties
      ? {
          ...config.baseProperties,
          definitions: detachedBase ?? config.baseProperties.definitions,
        }
      : config.baseProperties,
  };

  if (parentId) {
    const customResult = appendPropertyToParent(
      nextConfig.customFields.definitions,
      parentId,
      found.definition,
    );
    if (customResult.changed) {
      nextConfig = {
        ...nextConfig,
        customFields: {
          ...nextConfig.customFields,
          definitions: customResult.definitions as CustomFieldDefinition[],
        },
      };
    } else if (nextConfig.baseProperties) {
      const baseResult = appendPropertyToParent(
        nextConfig.baseProperties.definitions,
        parentId,
        found.definition,
      );
      if (baseResult.changed) {
        nextConfig = {
          ...nextConfig,
          baseProperties: {
            ...nextConfig.baseProperties,
            definitions: baseResult.definitions as typeof nextConfig.baseProperties.definitions,
          },
        };
      }
    }
  } else if (found.source === "base" && nextConfig.baseProperties) {
    nextConfig = {
      ...nextConfig,
      baseProperties: {
        ...nextConfig.baseProperties,
        definitions: [
          ...nextConfig.baseProperties.definitions,
          found.definition as (typeof nextConfig.baseProperties.definitions)[number],
        ],
      },
    };
  } else {
    nextConfig = {
      ...nextConfig,
      customFields: {
        ...nextConfig.customFields,
        definitions: [
          ...nextConfig.customFields.definitions,
          found.definition as CustomFieldDefinition,
        ],
      },
    };
  }

  return ensureTypePropertyMembership(nextConfig, entityType, [parentId || propertyId, propertyId]);
}

function getPropertyPathFromDefinitions(
  definitions: PropertyDefinition[],
  targetId: string,
): string[] {
  for (const definition of definitions) {
    if (definition.id === targetId) return [definition.id];
    if (definition.children?.length) {
      const childPath = getPropertyPathFromDefinitions(definition.children, targetId);
      if (childPath.length) return [definition.id, ...childPath];
    }
  }
  return [];
}

export function removeInspectorProperty(
  config: PropertiesConfig,
  propertyId: string,
): PropertiesConfig {
  const nextOrder = (config.baseProperties?.order ?? []).filter((id) => id !== propertyId);
  return {
    ...config,
    baseProperties: config.baseProperties
      ? {
          ...config.baseProperties,
          order: nextOrder,
          visibleByDefault: (config.baseProperties.visibleByDefault ?? []).filter(
            (id) => id !== propertyId,
          ),
          definitions: removePropertyDefinitions(
            config.baseProperties.definitions,
            propertyId,
          ) as typeof config.baseProperties.definitions,
        }
      : config.baseProperties,
    customFields: {
      ...config.customFields,
      definitions: removePropertyDefinitions(
        config.customFields.definitions,
        propertyId,
      ) as CustomFieldDefinition[],
      globalFields: (config.customFields.globalFields ?? []).filter((id) => id !== propertyId),
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => ({
        ...definition,
        customFields: (definition.customFields ?? []).filter((id) => id !== propertyId),
        visibleProperties: definition.visibleProperties?.filter((id) => id !== propertyId),
        hiddenProperties: definition.hiddenProperties?.filter((id) => id !== propertyId),
        propertyOrder: definition.propertyOrder?.filter((id) => id !== propertyId),
      })),
    },
  };
}

export function reorderInspectorPropertySiblings(
  config: PropertiesConfig,
  entityType: string | undefined,
  draggedId: string,
  targetId: string,
): PropertiesConfig {
  const customResult = reorderSiblingDefinitions(
    config.customFields.definitions,
    draggedId,
    targetId,
  );
  const baseResult = config.baseProperties
    ? reorderSiblingDefinitions(config.baseProperties.definitions, draggedId, targetId)
    : { definitions: [], changed: false };

  if (customResult.changed || baseResult.changed) {
    return {
      ...config,
      customFields: {
        ...config.customFields,
        definitions: customResult.definitions as CustomFieldDefinition[],
      },
      baseProperties: config.baseProperties
        ? {
            ...config.baseProperties,
            definitions: baseResult.changed
              ? (baseResult.definitions as typeof config.baseProperties.definitions)
              : config.baseProperties.definitions,
          }
        : config.baseProperties,
    };
  }

  const currentOrder = getConfiguredPropertyOrder(config, entityType);
  const withoutDragged = currentOrder.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return config;
  withoutDragged.splice(targetIndex, 0, draggedId);
  return reorderPropertiesConfig(config, entityType, withoutDragged);
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

export function getConfiguredFrontmatterOrder(
  config: PropertiesConfig | undefined,
  entityType: string | undefined,
  frontmatterKeys: string[],
): string[] {
  const keys = new Set(frontmatterKeys);
  const typeDefinition = getTypeDefinition(config, entityType);
  const configuredOrder = uniqueInOrder([
    "folder",
    ...expandPropertyOrderIds(
      config,
      typeDefinition?.propertyOrder ?? config?.baseProperties?.order ?? [],
    ),
    ...flattenPropertyDefinitions(config?.baseProperties?.definitions ?? []).map(
      (property) => property.id,
    ),
    ...(config?.customFields.globalFields ?? []),
    ...expandPropertyOrderIds(config, typeDefinition?.customFields ?? []),
    ...flattenPropertyDefinitions(config?.customFields.definitions ?? []).map(
      (property) => property.id,
    ),
  ]);

  const ordered = configuredOrder.filter((key) => keys.has(key));
  const remaining = frontmatterKeys.filter((key) => !ordered.includes(key));
  return [...ordered, ...remaining];
}

export function flattenPropertyDefinitions(
  definitions: PropertyDefinition[],
): PropertyDefinition[] {
  const flattened: PropertyDefinition[] = [];
  traversePropertyTree(definitions, (definition) => {
    flattened.push(definition);
  });
  return flattened;
}

export function getConfiguredPropertyOrder(
  config: PropertiesConfig | undefined,
  entityType?: string,
): string[] {
  const allIds = listInspectableProperties(config).map((property) => property.id);
  return getConfiguredFrontmatterOrder(config, entityType, allIds).filter(
    (id) => !NON_INSPECTOR_PROPERTY_IDS.has(id),
  );
}

export function reorderPropertiesConfig(
  config: PropertiesConfig,
  entityType: string | undefined,
  orderedIds: string[],
): PropertiesConfig {
  if (!config.baseProperties) return config;
  const sanitizedOrder = uniqueInOrder(
    orderedIds.filter((id) => !NON_INSPECTOR_PROPERTY_IDS.has(id)),
  );
  return {
    ...config,
    baseProperties: {
      ...config.baseProperties,
      order: sanitizedOrder,
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) =>
        entityType && definition.id === entityType
          ? {
              ...definition,
              propertyOrder: sanitizedOrder,
            }
          : definition,
      ),
    },
  };
}

export function updateFrontmatterProperties(
  frontmatterRaw: string,
  updates: Record<string, unknown>,
  config?: PropertiesConfig,
  entityType?: string,
): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) {
      delete data[key];
    } else {
      data[key] = value;
    }
  });
  const nextOrder = getConfiguredFrontmatterOrder(config, entityType, Object.keys(data));
  return reorderFrontmatter(frontmatterDataToRaw(data), nextOrder);
}

export function removeFrontmatterProperty(
  frontmatterRaw: string,
  key: string,
  config?: PropertiesConfig,
  entityType?: string,
): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  delete data[key];
  const nextOrder = getConfiguredFrontmatterOrder(config, entityType, Object.keys(data));
  return reorderFrontmatter(frontmatterDataToRaw(data), nextOrder);
}

export function adaptFrontmatterProperty(
  frontmatterRaw: string,
  fromKey: string,
  toKey: string,
  config?: PropertiesConfig,
  entityType?: string,
): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  if (!(fromKey in data)) return frontmatterRaw;
  data[toKey] = data[fromKey];
  delete data[fromKey];
  const nextOrder = getConfiguredFrontmatterOrder(config, entityType, Object.keys(data));
  return reorderFrontmatter(frontmatterDataToRaw(data), nextOrder);
}

/**
 * Reorders frontmatter fields according to expected order
 * Ensures folder field always has its system property comment
 * @param frontmatterRaw The raw YAML frontmatter string
 * @param expectedOrder Array of field keys in desired order
 * @returns Reordered frontmatter string with folder comment preserved/added
 */
export function reorderFrontmatter(frontmatterRaw: string, expectedOrder: string[]): string {
  const data = parseFrontmatterRaw(frontmatterRaw);
  const reordered: Record<string, unknown> = {};

  // Add fields in expected order
  expectedOrder.forEach((key) => {
    if (key in data) {
      reordered[key] = data[key];
    }
  });

  // Add any remaining fields not in expected order
  Object.entries(data).forEach(([key, value]) => {
    if (!(key in reordered)) {
      reordered[key] = value;
    }
  });

  let result = frontmatterDataToRaw(reordered);

  // Ensure folder field has system property comment if it exists
  if ("folder" in reordered && reordered.folder) {
    const folderValue = reordered.folder;
    const yamlScalarValue =
      typeof folderValue === "string" && /^[A-Za-z0-9 _.-]+$/.test(folderValue)
        ? folderValue
        : JSON.stringify(folderValue);

    // Replace folder line with commented version
    const folderLineRegex = /^folder:\s*.+?(?=\n|$)/m;
    result = result.replace(
      folderLineRegex,
      `folder: ${yamlScalarValue} # ${FOLDER_SYSTEM_PROPERTY_COMMENT}`,
    );
  }

  return result;
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
    .filter((value): value is string | number | boolean =>
      ["string", "number", "boolean"].includes(typeof value),
    )
    .map((value) => {
      const label = String(value);
      return { value: sanitizePropertyId(label) || label, label };
    });
}

export function propertyUsesOptions(type: CustomFieldType) {
  return type === "select" || type === "multiselect";
}

function renameInDefinitionTree(
  definitions: PropertyDefinition[],
  oldId: string,
  newId: string,
): PropertyDefinition[] {
  return definitions.map((definition) => {
    const next: PropertyDefinition = {
      ...definition,
      id: definition.id === oldId ? newId : definition.id,
      label:
        definition.id === oldId && (!definition.label || definition.label === definition.id)
          ? labelFromPropertyId(newId)
          : definition.label,
    };
    if (next.visibleWhen && oldId in next.visibleWhen) {
      const { [oldId]: renamedValues, ...rest } = next.visibleWhen;
      next.visibleWhen = { ...rest, [newId]: renamedValues };
    }
    if (next.children?.length) {
      next.children = renameInDefinitionTree(next.children, oldId, newId);
    }
    return next;
  });
}

function renameIdInList(ids: string[] | undefined, oldId: string, newId: string) {
  return ids?.map((id) => (id === oldId ? newId : id));
}

/**
 * Renames a property everywhere in the schema: definitions (base + custom,
 * including nested children), order lists, visibility lists, per-type
 * memberships, and visibleWhen conditions that reference it.
 *
 * Note values in vault notes are NOT touched; callers migrate the active
 * note with adaptFrontmatterProperty and rely on the unconfigured-property
 * flow for other notes.
 */
export function renameInspectorProperty(
  config: PropertiesConfig,
  oldId: string,
  newId: string,
): PropertiesConfig {
  if (oldId === newId || !newId) return config;
  if (knownPropertyIds(config).has(newId)) return config;

  return {
    ...config,
    baseProperties: config.baseProperties
      ? {
          ...config.baseProperties,
          definitions: renameInDefinitionTree(
            config.baseProperties.definitions,
            oldId,
            newId,
          ) as typeof config.baseProperties.definitions,
          order: renameIdInList(config.baseProperties.order, oldId, newId),
          visibleByDefault: renameIdInList(config.baseProperties.visibleByDefault, oldId, newId),
        }
      : config.baseProperties,
    customFields: {
      ...config.customFields,
      definitions: renameInDefinitionTree(
        config.customFields.definitions,
        oldId,
        newId,
      ) as CustomFieldDefinition[],
      globalFields: renameIdInList(config.customFields.globalFields, oldId, newId),
    },
    entityTypes: {
      ...config.entityTypes,
      definitions: config.entityTypes.definitions.map((definition) => ({
        ...definition,
        customFields: renameIdInList(definition.customFields, oldId, newId),
        visibleProperties: renameIdInList(definition.visibleProperties, oldId, newId),
        hiddenProperties: renameIdInList(definition.hiddenProperties, oldId, newId),
        propertyOrder: renameIdInList(definition.propertyOrder, oldId, newId),
      })),
    },
  };
}

/**
 * Changes the type of a schema property (base or custom, at any depth).
 * Options are kept only for option-based types; they are initialized empty
 * when switching into select/multiselect without existing options.
 */
export function changePropertyType(
  config: PropertiesConfig,
  propertyId: string,
  newType: CustomFieldType,
): PropertiesConfig {
  const applyType = (definition: PropertyDefinition): PropertyDefinition => {
    if (definition.type === newType) return definition;
    const next: PropertyDefinition = { ...definition, type: newType };
    if (propertyUsesOptions(newType)) {
      next.options = definition.options ?? [];
    } else {
      delete next.options;
    }
    if (newType !== "entity-ref" && newType !== "entity-ref-list") {
      delete next.targetTypes;
    }
    if (newType !== "number") {
      delete next.min;
      delete next.max;
    }
    return next;
  };

  return {
    ...config,
    baseProperties: config.baseProperties
      ? {
          ...config.baseProperties,
          definitions: mapPropertyDefinitions(
            config.baseProperties.definitions,
            propertyId,
            applyType,
          ) as typeof config.baseProperties.definitions,
        }
      : config.baseProperties,
    customFields: {
      ...config.customFields,
      definitions: mapPropertyDefinitions(
        config.customFields.definitions,
        propertyId,
        applyType,
      ) as CustomFieldDefinition[],
    },
  };
}
