import type { TaxonomyConfig, CustomFieldDefinition } from "../editorTypes";

/**
 * Property template for quick setup
 */
export type PropertyTemplate = {
  id: string;
  label: string;
  description: string;
  /**
   * IDs of base properties to show by default
   */
  visibleBaseProperties: string[];
  /**
   * Custom field definitions to add
   */
  customFields: CustomFieldDefinition[];
};

/**
 * Minimal template - Only essential fields
 * Shows: id, name, type
 */
export const MINIMAL_TEMPLATE: PropertyTemplate = {
  id: "minimal",
  label: "Minimal",
  description: "Only essential fields (id, name, type)",
  visibleBaseProperties: ["id", "name", "type"],
  customFields: [],
};

/**
 * Standard template - Common fields for most use cases
 * Shows: id, name, type + status
 */
export const STANDARD_TEMPLATE: PropertyTemplate = {
  id: "standard",
  label: "Standard",
  description: "Common fields for most use cases (+ status)",
  visibleBaseProperties: ["id", "name", "type"],
  customFields: [
    {
      id: "status",
      label: "Status",
      type: "select",
      description: "Editorial state for this note",
      required: false,
    },
  ],
};

/**
 * Collaborative template - For team collaboration
 * Shows: id, name, type + status, author, lastModified, assignee
 */
export const COLLABORATIVE_TEMPLATE: PropertyTemplate = {
  id: "collaborative",
  label: "Collaborative",
  description: "Team collaboration with author tracking and assignments",
  visibleBaseProperties: ["id", "name", "type"],
  customFields: [
    {
      id: "status",
      label: "Status",
      type: "select",
      description: "Editorial state for this note",
      required: false,
    },
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
 * Worldbuilding template - For narrative universe building
 * Adds worldbuilding properties on top of the protected id/name/type base.
 */
export const WORLDBUILDING_TEMPLATE: PropertyTemplate = {
  id: "worldbuilding",
  label: "Worldbuilding",
  description: "Narrative universe with hierarchies and lore tracking",
  visibleBaseProperties: ["id", "name", "type"],
  customFields: [
    {
      id: "status",
      label: "Status",
      type: "select",
      description: "Editorial state for this note",
      required: false,
    },
    {
      id: "aliases",
      label: "Aliases",
      type: "text",
      description: "Alternative names or search labels",
      required: false,
    },
    {
      id: "parentId",
      label: "Parent",
      type: "entity-ref",
      description: "Parent entity ID",
      required: false,
    },
    {
      id: "childrenIds",
      label: "Children",
      type: "entity-ref-list",
      description: "Child entity IDs",
      required: false,
    },
    {
      id: "category",
      label: "Category",
      type: "select",
      description: "Worldbuilding category",
      required: false,
      options: [
        { value: "character", label: "Character" },
        { value: "location", label: "Location" },
        { value: "item", label: "Item" },
        { value: "event", label: "Event" },
        { value: "concept", label: "Concept" },
        { value: "faction", label: "Faction" },
      ],
    },
    {
      id: "lore-level",
      label: "Lore Level",
      type: "select",
      description: "Level of detail/canonicity",
      required: false,
      options: [
        { value: "canon", label: "Canon" },
        { value: "semi-canon", label: "Semi-Canon" },
        { value: "draft", label: "Draft" },
        { value: "idea", label: "Idea" },
      ],
    },
  ],
};

/**
 * Task Management template - For project/task tracking
 * Shows: id, name, type + status, priority, dueDate, assignee
 */
export const TASK_MANAGEMENT_TEMPLATE: PropertyTemplate = {
  id: "task-management",
  label: "Task Management",
  description: "Project and task tracking with priorities and deadlines",
  visibleBaseProperties: ["id", "name", "type"],
  customFields: [
    {
      id: "status",
      label: "Status",
      type: "select",
      description: "Task state",
      required: false,
    },
    {
      id: "priority",
      label: "Priority",
      type: "select",
      description: "Task priority level",
      required: false,
      options: [
        { value: "urgent", label: "🔴 Urgent" },
        { value: "high", label: "🟠 High" },
        { value: "medium", label: "🟡 Medium" },
        { value: "low", label: "🟢 Low" },
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
 * All available property templates
 */
export const PROPERTY_TEMPLATES: PropertyTemplate[] = [
  WORLDBUILDING_TEMPLATE,
];

/**
 * Apply a property template to a taxonomy config
 */
export function applyPropertyTemplate(
  taxonomyConfig: TaxonomyConfig,
  template: PropertyTemplate
): TaxonomyConfig {
  if (!taxonomyConfig.baseProperties) {
    throw new Error("Taxonomy config must have baseProperties defined");
  }

  const newVisibleByDefault = [...template.visibleBaseProperties];

  // Merge custom fields (avoid duplicates)
  const existingCustomFieldIds = new Set(
    taxonomyConfig.customFields?.definitions.map((f: CustomFieldDefinition) => f.id) || []
  );
  
  const newCustomFields = [
    ...(taxonomyConfig.customFields?.definitions || []),
    ...template.customFields.filter((field) => !existingCustomFieldIds.has(field.id)),
  ];
  const templateFieldIds = template.customFields.map((field) => field.id);

  return {
    ...taxonomyConfig,
    baseProperties: {
      ...taxonomyConfig.baseProperties,
      visibleByDefault: newVisibleByDefault,
      order: [...newVisibleByDefault],
    },
    customFields: {
      definitions: newCustomFields,
      globalFields: [...new Set([...(taxonomyConfig.customFields?.globalFields || []), ...templateFieldIds])],
    },
  };
}

/**
 * Get a template by ID
 */
export function getTemplateById(templateId: string): PropertyTemplate | undefined {
  return PROPERTY_TEMPLATES.find((t) => t.id === templateId);
}
