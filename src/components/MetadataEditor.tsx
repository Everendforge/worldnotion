import { useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, EyeOff, GripVertical, MoreHorizontal, Plus, Settings2, SlidersHorizontal, Trash2, Wand2, X } from "lucide-react";
import type { Entity } from "../domain";
import type { PropertiesConfig, BasePropertyDefinition, CustomFieldDefinition } from "../editorTypes";
import {
  adaptFrontmatterProperty,
  buildInspectorPropertySections,
  type InspectorPropertyTreeNode,
  inferPropertyDefinition,
  listAllProperties,
  listInspectableProperties,
  listUnconfiguredProperties,
  listVisibleProperties,
  NON_INSPECTOR_PROPERTY_IDS,
  parseFrontmatterRaw,
  removeFrontmatterProperty,
  getConfiguredFrontmatterOrder,
  reorderInspectorPropertySiblings,
  removeInspectorProperty,
  reorderFrontmatter,
  setInspectorPropertyVisibility,
  upsertInspectorProperty,
} from "../utils/propertiesConfig";
import { detectOrphanedFields, inferValueType } from "../utils/frontmatterValidator";
import { PropertyFieldRenderer } from "./PropertyFieldRenderer";
import { PropertyManagerModal } from "./PropertyManagerModal";

type MetadataEditorProps = {
  entity: Entity;
  propertiesConfig?: PropertiesConfig;
  rawYaml: string;
  onUpdate: (updates: Partial<Entity>) => void;
  onUpdateRawYaml?: (yaml: string) => void;
  onUpdatePropertiesConfig?: (properties: PropertiesConfig) => void | Promise<void>;
  onConserveField?: (fieldName: string, value: unknown) => void | Promise<void>;
  onDeleteField?: (fieldName: string) => void;
};

type EditableOption = { value: string; label: string; color?: string };
type ConditionDraftState = {
  propertyId: string;
  parentId: string;
  values: string[];
};

const ENTITY_FRONTMATTER_FIELD_IDS = new Set(["id", "name", "type", "status", "tags", "aliases", "parentId", "childrenIds", "folder"]);

function formatPreviewValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function MetadataEditor({
  entity,
  propertiesConfig,
  rawYaml,
  onUpdate,
  onUpdateRawYaml,
  onUpdatePropertiesConfig,
  onConserveField,
  onDeleteField,
}: MetadataEditorProps) {
  const [adaptTargets, setAdaptTargets] = useState<Record<string, string>>({});
  const [draggedPropertyId, setDraggedPropertyId] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState<{ propertyId: string; options: EditableOption[] } | null>(null);
  const [propertyContextMenu, setPropertyContextMenu] = useState<{ x: number; y: number; propertyId?: string } | null>(null);
  const [propertyManagerSelection, setPropertyManagerSelection] = useState<string | undefined>();
  const [conditionDraft, setConditionDraft] = useState<ConditionDraftState | null>(null);
  const [showHiddenProperties, setShowHiddenProperties] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const entityTypes = propertiesConfig?.entityTypes.definitions ?? [];
  const statuses = propertiesConfig?.statuses.definitions ?? [];
  const customFieldDefs = propertiesConfig?.customFields.definitions ?? [];
  const basePropertyDefs = propertiesConfig?.baseProperties?.definitions ?? [];
  const frontmatterData = useMemo(() => parseFrontmatterRaw(rawYaml), [rawYaml]);
  const configuredProperties = useMemo(() => listAllProperties(propertiesConfig), [propertiesConfig]);

  // Detect orphaned fields (new validator-based detection)
  const orphanedFields = useMemo(() => detectOrphanedFields(frontmatterData, propertiesConfig, entity.type), [frontmatterData, propertiesConfig, entity.type]);

  // Categorize issues by type
  const missingFields = useMemo(() => orphanedFields.filter(i => i.type === "missing"), [orphanedFields]);
  const extraFields = useMemo(() => orphanedFields.filter(i => i.type === "extra"), [orphanedFields]);
  const misorderedFields = useMemo(() => orphanedFields.filter(i => i.type === "misorder"), [orphanedFields]);

  // Get entity type definition
  const entityTypeDef = entityTypes.find((t) => t.id === entity.type);

  // Determine which properties to show
  const visibleProperties = useMemo(() => {
    if (basePropertyDefs.length > 0) {
      return listVisibleProperties(propertiesConfig, entity.type);
    }

    // Backward compatibility: no baseProperties defined, use legacy behavior
    return null;
  }, [basePropertyDefs.length, entity.type, propertiesConfig]);

  const inspectorProperties = useMemo(
    () => visibleProperties?.filter((property) => !NON_INSPECTOR_PROPERTY_IDS.has(property.id)) ?? null,
    [visibleProperties],
  );

  const unconfiguredProperties = useMemo(
    () => listUnconfiguredProperties(frontmatterData, propertiesConfig),
    [frontmatterData, propertiesConfig],
  );

  const handlePropertyChange = (propertyId: string, value: unknown) => {
    if (ENTITY_FRONTMATTER_FIELD_IDS.has(propertyId)) {
      onUpdate({ [propertyId]: value } as Partial<Entity>);
    } else {
      onUpdate({
        customProperties: {
          ...entity.customProperties,
          [propertyId]: value,
        },
      });
    }
  };

  const getPropertyValue = (property: BasePropertyDefinition | CustomFieldDefinition): unknown => {
    if (property.id in frontmatterData) return frontmatterData[property.id];
    if (ENTITY_FRONTMATTER_FIELD_IDS.has(property.id)) return (entity as any)[property.id];
    return entity.customProperties[property.id];
  };

  const removeUnconfiguredProperty = (key: string) => {
    if (!onUpdateRawYaml) return;
    onUpdateRawYaml(removeFrontmatterProperty(rawYaml, key, propertiesConfig, entity.type));
  };

  const adaptUnconfiguredProperty = (key: string) => {
    if (!onUpdateRawYaml) return;
    const target = adaptTargets[key];
    if (!target || target === key) return;
    onUpdateRawYaml(adaptFrontmatterProperty(rawYaml, key, target, propertiesConfig, entity.type));
  };

  const saveConfig = (nextConfig: PropertiesConfig) => {
    void onUpdatePropertiesConfig?.(nextConfig);
  };

  const allInspectableProperties = useMemo(
    () => listInspectableProperties(propertiesConfig),
    [propertiesConfig],
  );

  const contextProperty = useMemo(
    () => allInspectableProperties.find((property) => property.id === propertyContextMenu?.propertyId),
    [allInspectableProperties, propertyContextMenu?.propertyId],
  );

  const visiblePropertyIds = useMemo(
    () => new Set(inspectorProperties?.map((property) => property.id) ?? []),
    [inspectorProperties],
  );

  const openPropertyManager = (propertyId?: string) => {
    setPropertyManagerSelection(propertyId ?? inspectorProperties?.[0]?.id ?? allInspectableProperties[0]?.id);
    setPropertyContextMenu(null);
  };

  const savePropertyDefinition = (property: CustomFieldDefinition, parentId?: string) => {
    if (!propertiesConfig) return;
    const nextConfig = upsertInspectorProperty(propertiesConfig, property, entity.type, parentId);
    saveConfig(nextConfig);
  };

  const deletePropertyFromUniverse = (propertyId: string) => {
    if (!propertiesConfig) return;
    const confirmed = window.confirm("Delete this property from universe properties? Existing note values will stay until removed from frontmatter.");
    if (!confirmed) return;
    saveConfig(removeInspectorProperty(propertiesConfig, propertyId));
    setPropertyContextMenu(null);
  };

  const removePropertyFromNote = (propertyId: string) => {
    if (!onUpdateRawYaml) return;
    onUpdateRawYaml(removeFrontmatterProperty(rawYaml, propertyId, propertiesConfig, entity.type));
    setPropertyContextMenu(null);
  };

  const saveUnlockCondition = () => {
    if (!conditionDraft || !propertiesConfig) return;
    const property = allInspectableProperties.find((candidate) => candidate.id === conditionDraft.propertyId);
    if (!property || !("type" in property)) return;
    const nextProperty = {
      ...property,
      visibleWhen: {
        ...(property.visibleWhen ?? {}),
        [conditionDraft.parentId]: conditionDraft.values,
      },
    } as CustomFieldDefinition;
    saveConfig(upsertInspectorProperty(propertiesConfig, nextProperty, entity.type));
    setConditionDraft(null);
  };

  const getPropertyOptions = (property: BasePropertyDefinition | CustomFieldDefinition) => {
    if (property.type === "select" || property.type === "multiselect") {
      // Special handling for type and status properties
      if (property.id === "type") {
        return entityTypes.map(t => ({ value: t.id, label: t.label, color: t.color }));
      }
      if (property.id === "status") {
        return statuses.map(s => ({ value: s.id, label: s.label, color: s.color }));
      }
      
      // Use property-defined options
      return property.options;
    }
    return undefined;
  };

  const propertyCanEditOptions = (property: BasePropertyDefinition | CustomFieldDefinition) =>
    property.id === "type" || property.id === "status" || property.type === "select" || property.type === "multiselect";

  const getEditableOptions = (property: BasePropertyDefinition | CustomFieldDefinition): EditableOption[] => {
    if (property.id === "type") {
      return entityTypes.map((type) => ({ value: type.id, label: type.label, color: type.color }));
    }
    if (property.id === "status") {
      return statuses.map((status) => ({ value: status.id, label: status.label, color: status.color }));
    }
    return property.options ?? [];
  };

  const updatePropertyOptions = (
    property: BasePropertyDefinition | CustomFieldDefinition,
    options: EditableOption[],
  ) => {
    if (!propertiesConfig) return;
    const normalizedOptions = options
      .map((option) => ({
        value: option.value.trim(),
        label: option.label.trim() || option.value.trim(),
        color: option.color?.trim() || undefined,
      }))
      .filter((option) => option.value.length > 0);

    if (property.id === "type") {
      const existingById = new Map(propertiesConfig.entityTypes.definitions.map((definition) => [definition.id, definition]));
      const definitions = normalizedOptions.map((option) => ({
        ...(existingById.get(option.value) ?? { id: option.value, customFields: [] }),
        id: option.value,
        label: option.label,
        color: option.color,
      }));
      saveConfig({
        ...propertiesConfig,
        entityTypes: {
          ...propertiesConfig.entityTypes,
          definitions,
          defaultType: definitions.some((definition) => definition.id === propertiesConfig.entityTypes.defaultType)
            ? propertiesConfig.entityTypes.defaultType
            : definitions[0]?.id ?? propertiesConfig.entityTypes.defaultType,
        },
      });
      return;
    }

    if (property.id === "status") {
      const existingById = new Map(propertiesConfig.statuses.definitions.map((definition) => [definition.id, definition]));
      const definitions = normalizedOptions.map((option, index) => ({
        ...(existingById.get(option.value) ?? { id: option.value }),
        id: option.value,
        label: option.label,
        color: option.color,
        order: index,
      }));
      saveConfig({
        ...propertiesConfig,
        statuses: {
          ...propertiesConfig.statuses,
          definitions,
          defaultStatus: definitions.some((definition) => definition.id === propertiesConfig.statuses.defaultStatus)
            ? propertiesConfig.statuses.defaultStatus
            : definitions[0]?.id ?? propertiesConfig.statuses.defaultStatus,
        },
      });
      return;
    }

    if ("immutable" in property) {
      saveConfig({
        ...propertiesConfig,
        baseProperties: propertiesConfig.baseProperties
          ? {
              ...propertiesConfig.baseProperties,
              definitions: propertiesConfig.baseProperties.definitions.map((definition) =>
                definition.id === property.id ? { ...definition, options: normalizedOptions } : definition,
              ),
            }
          : propertiesConfig.baseProperties,
      });
      return;
    }

    saveConfig({
      ...propertiesConfig,
      customFields: {
        ...propertiesConfig.customFields,
        definitions: propertiesConfig.customFields.definitions.map((definition) =>
          definition.id === property.id ? { ...definition, options: normalizedOptions } : definition,
        ),
      },
    });
  };

  const hideProperty = (propertyId: string) => {
    if (!propertiesConfig?.baseProperties) return;
    saveConfig(setInspectorPropertyVisibility(propertiesConfig, entity.type, propertyId, false));
  };

  const showProperty = (propertyId: string) => {
    if (!propertiesConfig?.baseProperties) return;
    saveConfig(setInspectorPropertyVisibility(propertiesConfig, entity.type, propertyId, true));
  };

  const togglePropertyVisibility = (propertyId: string) => {
    if (visiblePropertyIds.has(propertyId)) {
      hideProperty(propertyId);
    } else {
      showProperty(propertyId);
    }
  };

  const reorderProperty = (targetPropertyId: string) => {
    if (!propertiesConfig?.baseProperties || !draggedPropertyId || draggedPropertyId === targetPropertyId || !inspectorProperties) return;
    const nextConfig = reorderInspectorPropertySiblings(propertiesConfig, entity.type, draggedPropertyId, targetPropertyId);

    saveConfig(nextConfig);
    onUpdateRawYaml?.(reorderFrontmatter(rawYaml, getConfiguredFrontmatterOrder(nextConfig, entity.type, Object.keys(frontmatterData))));
    setDraggedPropertyId(null);
  };

  const closeOptionsPopup = () => {
    if (optionDraft && inspectorProperties) {
      const property = inspectorProperties.find((candidate) => candidate.id === optionDraft.propertyId);
      if (property) {
        updatePropertyOptions(property, optionDraft.options);
      }
    }
    setOptionDraft(null);
  };

  const openOptionsPopup = (property: BasePropertyDefinition | CustomFieldDefinition) => {
    setOptionDraft({ propertyId: property.id, options: getEditableOptions(property) });
  };

  const handleAutoReorder = () => {
    const frontmatterKeys = Object.keys(frontmatterData);
    const expectedOrder = getConfiguredFrontmatterOrder(propertiesConfig, entity.type, frontmatterKeys);
    const reorderedYaml = reorderFrontmatter(rawYaml, expectedOrder);
    onUpdateRawYaml?.(reorderedYaml);
  };

  /**
   * Get all current property values for visibleWhen evaluation
   */
  const getPropertyValues = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      status: entity.status,
      tags: entity.tags,
      aliases: entity.aliases,
      parentId: entity.parentId,
      childrenIds: entity.childrenIds,
    };
    
    Object.entries(frontmatterData).forEach(([key, value]) => {
      values[key] = value;
    });
    
    Object.entries(entity.customProperties).forEach(([key, value]) => {
      values[key] = value;
    });

    values.type = values.type || entity.type;
    values.status = values.status || entity.status;
    
    return values;
  };

  const openPropertyContextMenu = (
    event: React.MouseEvent,
    property?: BasePropertyDefinition | CustomFieldDefinition,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 270;
    const menuHeight = property ? 360 : Math.min(430, 88 + allInspectableProperties.length * 34);
    setPropertyContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
      propertyId: property?.id,
    });
  };

  const propertySections = useMemo(
    () =>
      buildInspectorPropertySections(propertiesConfig, entity.type, getPropertyValues(), {
        includeHidden: showHiddenProperties,
        includeInactiveConditions: showHiddenProperties,
      }),
    [entity.customProperties, entity.type, frontmatterData, propertiesConfig, showHiddenProperties],
  );

  const renderPropertyNode = (node: InspectorPropertyTreeNode): React.ReactNode => {
    const property = node.property;
    const hasChildren = Boolean(node.children.length);
    const value = getPropertyValue(property as BasePropertyDefinition | CustomFieldDefinition);
    const options = getPropertyOptions(property as BasePropertyDefinition | CustomFieldDefinition);
    const isReadOnly = "readOnly" in property && property.readOnly;
    const isGroup = property.type === "group";
    const isCollapsed = collapsedGroups.has(property.id);

    if (!node.conditionActive) {
      return (
        <div
          key={property.id}
          className={`metadata-property-node metadata-property-node-locked metadata-field-depth-${node.depth}`}
          onContextMenu={(event) => openPropertyContextMenu(event, property as BasePropertyDefinition | CustomFieldDefinition)}
        >
          <div className="metadata-property-rail" />
          <div className="metadata-property-locked-content">
            <strong>{property.label || property.id}</strong>
            <span>Conditional property</span>
          </div>
          <button
            type="button"
            title="Edit property"
            onClick={() => openPropertyManager(property.id)}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      );
    }

    return (
      <div
        key={property.id}
        className={`metadata-property-node metadata-property-depth-${node.depth} ${draggedPropertyId === property.id ? "dragging" : ""} ${isGroup || hasChildren ? "metadata-property-group" : ""} ${!node.visibleInType ? "metadata-property-hidden-node" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.stopPropagation();
          reorderProperty(property.id);
        }}
        onContextMenu={(event) => openPropertyContextMenu(event, property as BasePropertyDefinition | CustomFieldDefinition)}
      >
        <div className="metadata-property-row">
          <button
            type="button"
            className="metadata-field-handle"
            draggable
            onDragStart={() => setDraggedPropertyId(property.id)}
            onDragEnd={() => setDraggedPropertyId(null)}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
          <div className="metadata-property-body">
            {isGroup ? (
              <div className="metadata-property-group-title">
                <button
                  type="button"
                  className="metadata-property-group-toggle"
                  onClick={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(property.id)) next.delete(property.id);
                      else next.add(property.id);
                      return next;
                    })
                  }
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? "+" : "-"}
                </button>
                <span>{property.label || property.id}</span>
                <small>
                  {hasChildren ? `${node.children.length} child properties` : "Empty group"}
                </small>
              </div>
            ) : (
              <label>
                <span>
                  {property.label || property.id}
                  {property.required && <span className="required-star">*</span>}
                </span>
                <PropertyFieldRenderer
                  property={property as BasePropertyDefinition | CustomFieldDefinition}
                  value={value}
                  onChange={(newValue) => handlePropertyChange(property.id, newValue)}
                  readOnly={isReadOnly}
                  entityType={entity.type}
                  availableOptions={options}
                />
              </label>
            )}
          </div>
          <div className="metadata-field-actions">
            {propertyCanEditOptions(property as BasePropertyDefinition | CustomFieldDefinition) ? (
            <button
              type="button"
              className="metadata-field-options"
                aria-expanded={optionDraft?.propertyId === property.id}
                onClick={() =>
                  optionDraft?.propertyId === property.id ? closeOptionsPopup() : openOptionsPopup(property as BasePropertyDefinition | CustomFieldDefinition)
                }
                title="Edit dropdown options"
              >
              <SlidersHorizontal size={14} />
            </button>
          ) : null}
            <button type="button" onClick={(event) => openPropertyContextMenu(event, property as BasePropertyDefinition | CustomFieldDefinition)} title="More">
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>
        {hasChildren && !isCollapsed ? (
          <div className="metadata-property-children">
            {node.children.map((child) => renderPropertyNode(child))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderPropertySections = (): React.ReactNode[] => {
    return propertySections
      .filter((section) => section.nodes.length > 0)
      .map((section) => {
        const isCollapsed = collapsedSections.has(section.id);
        return (
          <section key={section.id} className={`metadata-property-section metadata-property-section-${section.kind}`}>
            <button
              type="button"
              className="metadata-property-section-title"
              onClick={() =>
                setCollapsedSections((current) => {
                  const next = new Set(current);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })
              }
              aria-expanded={!isCollapsed}
            >
              <span>{section.title}</span>
              <small>{isCollapsed ? "+" : "-"} {section.nodes.length}</small>
            </button>
            {!isCollapsed ? section.nodes.map((node) => renderPropertyNode(node)) : null}
          </section>
        );
      });
  };

  const renderOptionsPopup = () => {
    if (!optionDraft) return null;
    const property = allInspectableProperties.find((candidate) => candidate.id === optionDraft.propertyId);
    if (!property) return null;
    const updateOption = (index: number, updates: Partial<EditableOption>) => {
      setOptionDraft((current) =>
        current
          ? {
              ...current,
              options: current.options.map((option, optionIndex) =>
                optionIndex === index ? { ...option, ...updates } : option,
              ),
            }
          : current,
      );
    };
    const addOption = () => {
      setOptionDraft((current) => {
        if (!current) return current;
        const value = `option-${current.options.length + 1}`;
        return {
          ...current,
          options: [...current.options, { value, label: `Option ${current.options.length + 1}` }],
        };
      });
    };
    const deleteOption = (index: number) => {
      setOptionDraft((current) =>
        current
          ? {
              ...current,
              options: current.options.filter((_, optionIndex) => optionIndex !== index),
            }
          : current,
      );
    };

    return (
      <div className="inspector-local-popover" role="dialog" aria-label={`Edit ${property.label || property.id} options`}>
        <div className="inspector-local-popover-header">
          <strong>{property.label || property.id}</strong>
          <button type="button" onClick={closeOptionsPopup} title="Close">
            <X size={14} />
          </button>
        </div>
        <div className="inspector-option-list">
          {optionDraft.options.map((option, index) => (
            <div key={`${option.value}-${index}`} className="inspector-option-row">
              <input
                value={option.label}
                onChange={(event) => updateOption(index, { label: event.target.value })}
                placeholder="Label"
              />
              <input
                value={option.value}
                onChange={(event) => updateOption(index, { value: event.target.value })}
                placeholder="value"
              />
              <input
                type="color"
                value={option.color ?? "#64748b"}
                onChange={(event) => updateOption(index, { color: event.target.value })}
                title="Color"
              />
              <button type="button" className="danger" onClick={() => deleteOption(index)} title="Delete option">
                <Trash2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const child = inferPropertyDefinition(`${property.id}-${option.value}`, option.label);
                  child.visibleWhen = { [property.id]: [option.value] };
                  updatePropertyOptions(property, optionDraft.options);
                  setOptionDraft(null);
                  savePropertyDefinition(child, property.id);
                  openPropertyManager(child.id);
                }}
                title="Create child property for this option"
              >
                <Plus size={13} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="inspector-popover-action" onClick={addOption}>
          <Plus size={13} />
          Add option
        </button>
      </div>
    );
  };

  const renderPropertyContextMenu = () => {
    if (!propertyContextMenu) return null;
    const property = contextProperty;
    return (
      <div
        className="context-menu inspector-property-context-menu"
        style={{ left: `${propertyContextMenu.x}px`, top: `${propertyContextMenu.y}px` }}
        role="menu"
      >
        {property ? (
          <>
            <button type="button" className="context-menu-item" onClick={() => openPropertyManager(property.id)}>
              <Settings2 size={16} />
              <span>Customize properties</span>
            </button>
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                setPropertyContextMenu(null);
                setConditionDraft({
                  propertyId: property.id,
                  parentId: allInspectableProperties.find((candidate) => candidate.id !== property.id && (candidate.type === "select" || candidate.type === "multiselect"))?.id ?? "",
                  values: [],
                });
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Add unlock condition</span>
            </button>
            <button type="button" className="context-menu-item" onClick={() => hideProperty(property.id)}>
              <EyeOff size={16} />
              <span>Hide</span>
            </button>
            <button type="button" className="context-menu-item" onClick={() => removePropertyFromNote(property.id)}>
              <Trash2 size={16} />
              <span>Remove from this note</span>
            </button>
            <div className="context-menu-separator" />
            <button type="button" className="context-menu-item danger" onClick={() => deletePropertyFromUniverse(property.id)}>
              <Trash2 size={16} />
              <span>Delete from universe</span>
            </button>
            <div className="context-menu-separator" />
            {allInspectableProperties.map((candidate) => {
              const visible = visiblePropertyIds.has(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    togglePropertyVisibility(candidate.id);
                    setPropertyContextMenu(null);
                  }}
                >
                  <span className="context-menu-check">{visible ? "✓" : ""}</span>
                  <span>{candidate.label || candidate.id}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <button type="button" className="context-menu-item" onClick={() => openPropertyManager()}>
              <Settings2 size={16} />
              <span>Customize properties</span>
            </button>
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                setShowHiddenProperties((current) => !current);
                setPropertyContextMenu(null);
              }}
            >
              <EyeOff size={16} />
              <span>{showHiddenProperties ? "Hide hidden properties" : "Show hidden properties"}</span>
            </button>
            <div className="context-menu-separator" />
            {allInspectableProperties.map((candidate) => {
              const visible = visiblePropertyIds.has(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    togglePropertyVisibility(candidate.id);
                    setPropertyContextMenu(null);
                  }}
                >
                  <span className="context-menu-check">{visible ? "✓" : ""}</span>
                  <span>{candidate.label || candidate.id}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  };

  const renderConditionPopover = () => {
    if (!conditionDraft) return null;
    const parentCandidates = allInspectableProperties.filter(
      (property) => property.id !== conditionDraft.propertyId && (property.type === "select" || property.type === "multiselect"),
    );
    const parent = parentCandidates.find((candidate) => candidate.id === conditionDraft.parentId);
    const parentOptions = parent ? getEditableOptions(parent) : [];
    return (
      <div className="inspector-local-popover" role="dialog" aria-label="Unlock condition">
        <div className="inspector-local-popover-header">
          <strong>Unlock condition</strong>
          <button type="button" onClick={() => setConditionDraft(null)} title="Close">
            <X size={14} />
          </button>
        </div>
        <label className="inspector-popover-field">
          <span>Parent property</span>
          <select
            value={conditionDraft.parentId}
            onChange={(event) => setConditionDraft((current) => current ? { ...current, parentId: event.target.value, values: [] } : current)}
          >
            <option value="">Select parent...</option>
            {parentCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label || candidate.id}
              </option>
            ))}
          </select>
        </label>
        {parent ? (
          <div className="inspector-condition-options">
            {parentOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={conditionDraft.values.includes(option.value)}
                  onChange={(event) =>
                    setConditionDraft((current) => {
                      if (!current) return current;
                      const values = event.target.checked
                        ? [...current.values, option.value]
                        : current.values.filter((value) => value !== option.value);
                      return { ...current, values };
                    })
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="inspector-popover-action"
          onClick={saveUnlockCondition}
          disabled={!conditionDraft.parentId || conditionDraft.values.length === 0}
        >
          Save condition
        </button>
      </div>
    );
  };

  const renderPropertyManager = () => {
    if (!propertyManagerSelection || !propertiesConfig) return null;
    return (
      <PropertyManagerModal
        propertiesConfig={propertiesConfig}
        entityType={entity.type}
        initialPropertyId={propertyManagerSelection}
        onChange={saveConfig}
        onClose={() => setPropertyManagerSelection(undefined)}
      />
    );
  };

  // Use new property system if available, otherwise fall back to legacy
  if (inspectorProperties) {
    return (
      <div className="metadata-editor" onClick={(event) => {
        if (!(event.target as HTMLElement).closest(".inspector-local-popover, .metadata-field-options")) {
          closeOptionsPopup();
        }
        if (!(event.target as HTMLElement).closest(".inspector-property-context-menu, .property-manager-modal")) {
          setPropertyContextMenu(null);
        }
      }}
      onContextMenu={(event) => openPropertyContextMenu(event)}>
        {renderOptionsPopup()}
        {renderConditionPopover()}
        {renderPropertyManager()}
        {renderPropertyContextMenu()}
        <div className="metadata-fields">
          <div className="metadata-inspector-toolbar">
            <span>Properties</span>
            <button type="button" onClick={() => openPropertyManager()} title="Customize properties">
              <Settings2 size={14} />
              Customize
            </button>
          </div>
          {renderPropertySections()}

          {orphanedFields.length > 0 ? (
            <div className="metadata-orphaned-fields">
              <div className="metadata-section-divider metadata-section-divider-error">
                <AlertCircle size={16} />
                <span>Schema issues ({orphanedFields.length})</span>
              </div>
              <p className="field-hint">
                Your metadata does not match the universe schema. Review and fix these issues.
              </p>

              {/* Extra fields */}
              {extraFields.length > 0 && (
                <div className="metadata-issue-group">
                  <h4 className="metadata-issue-group-title metadata-issue-extra">
                    <AlertCircle size={14} /> Extra fields ({extraFields.length})
                  </h4>
                  <p className="field-hint">Fields not defined in the universe schema.</p>
                  {extraFields.map((field) => (
                    <div key={field.fieldName} className="metadata-orphaned-item metadata-issue-extra-item">
                      <div className="metadata-orphaned-content">
                        <div className="metadata-orphaned-header">
                          <strong className="metadata-orphaned-name">{field.fieldName}</strong>
                          <span className="metadata-orphaned-type">{inferValueType(field.value)}</span>
                        </div>
                        <code className="metadata-orphaned-value">{formatPreviewValue(field.value)}</code>
                      </div>
                      <div className="metadata-orphaned-actions">
                        <button
                          type="button"
                          className="metadata-action-primary"
                          onClick={() => {
                            onConserveField?.(field.fieldName, field.value);
                          }}
                          title="Add to universe schema"
                        >
                          <Plus size={13} />
                          Conserve
                        </button>
                        {field.fieldName !== "folder" && (
                          <button
                            type="button"
                            className="metadata-action-danger"
                            onClick={() => {
                              onDeleteField?.(field.fieldName);
                              if (onUpdateRawYaml) {
                                onUpdateRawYaml(removeFrontmatterProperty(rawYaml, field.fieldName));
                              }
                            }}
                            title="Remove from this note"
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Misorder fields */}
              {misorderedFields.length > 0 && (
                <div className="metadata-issue-group">
                  <div className="metadata-issue-header">
                    <h4 className="metadata-issue-group-title metadata-issue-misorder">
                      <AlertCircle size={14} /> Wrong order ({misorderedFields.length})
                    </h4>
                    <button
                      type="button"
                      className="metadata-action-primary"
                      onClick={handleAutoReorder}
                      title="Reorder fields to match schema"
                    >
                      <ArrowRightLeft size={13} />
                      Auto-reorder
                    </button>
                  </div>
                  <p className="field-hint">Fields should follow the schema order for consistency.</p>
                  {misorderedFields.map((field) => (
                    <div key={field.fieldName} className="metadata-orphaned-item metadata-issue-misorder-item">
                      <div className="metadata-orphaned-content">
                        <div className="metadata-orphaned-header">
                          <strong className="metadata-orphaned-name">{field.fieldName}</strong>
                          <span className="metadata-orphaned-type">
                            Position {field.actualPosition} → {field.expectedPosition}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing fields */}
              {missingFields.length > 0 && (
                <div className="metadata-issue-group">
                  <h4 className="metadata-issue-group-title metadata-issue-missing">
                    <AlertCircle size={14} /> Missing fields ({missingFields.length})
                  </h4>
                  <p className="field-hint">Required or important fields defined in schema are not present.</p>
                  {missingFields.map((field) => (
                    <div key={field.fieldName} className="metadata-orphaned-item metadata-issue-missing-item">
                      <div className="metadata-orphaned-content">
                        <div className="metadata-orphaned-header">
                          <strong className="metadata-orphaned-name">{field.fieldName}</strong>
                          <span className="metadata-orphaned-type">{field.expectedType || "unknown"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {unconfiguredProperties.length > 0 ? (
            <div className="metadata-unconfigured">
              <div className="metadata-section-divider">
                <span>Unconfigured properties</span>
              </div>
              <p className="field-hint">
                These keys exist in this note but are not declared in universe properties.
              </p>
              {unconfiguredProperties.map((property) => (
                <div key={property.key} className="metadata-unconfigured-item">
                  <div>
                    <strong>{property.key}</strong>
                    <span>{property.inferredType}</span>
                    <code>{formatPreviewValue(property.value)}</code>
                  </div>
                  <div className="metadata-unconfigured-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const nextProperty = inferPropertyDefinition(property.key, property.value);
                        savePropertyDefinition(nextProperty);
                        openPropertyManager(nextProperty.id);
                      }}
                      title="Add to universe properties"
                    >
                      <Plus size={13} />
                      Turn into property
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const parentId = inspectorProperties[0]?.id;
                        if (!parentId) return;
                        const nextProperty = inferPropertyDefinition(property.key, property.value);
                        savePropertyDefinition(nextProperty, parentId);
                        openPropertyManager(nextProperty.id);
                      }}
                      title="Attach as child property"
                      disabled={!inspectorProperties.length}
                    >
                      <Plus size={13} />
                      Attach
                    </button>
                    <label>
                      <select
                        value={adaptTargets[property.key] ?? ""}
                        onChange={(event) =>
                          setAdaptTargets((current) => ({ ...current, [property.key]: event.target.value }))
                        }
                      >
                        <option value="">Adapt to...</option>
                        {configuredProperties
                          .filter((candidate) => candidate.id !== property.key)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label || candidate.id}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="button" onClick={() => adaptUnconfiguredProperty(property.key)} title="Move value to selected property">
                      <Wand2 size={13} />
                      Adapt
                    </button>
                    <button type="button" className="danger" onClick={() => removeUnconfiguredProperty(property.key)} title="Remove from this note">
                      <Trash2 size={13} />
                      Hide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Legacy rendering (backward compatibility)
  const relevantFieldIds = [
    ...(propertiesConfig?.customFields.globalFields ?? []),
    ...(entityTypeDef?.customFields ?? []),
  ];
  const relevantFields = customFieldDefs.filter((f) => relevantFieldIds.includes(f.id));

  const handleFieldChange = (fieldId: string, value: unknown) => {
    onUpdate({
      customProperties: {
        ...entity.customProperties,
        [fieldId]: value,
      },
    });
  };

  const renderCustomField = (fieldDef: typeof customFieldDefs[0]) => {
    const value = entity.customProperties[fieldDef.id];

    switch (fieldDef.type) {
      case "text":
        return (
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => handleFieldChange(fieldDef.id, e.target.value)}
            placeholder={fieldDef.description}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={Number(value ?? "")}
            onChange={(e) => handleFieldChange(fieldDef.id, Number(e.target.value))}
            min={fieldDef.min}
            max={fieldDef.max}
            placeholder={fieldDef.description}
          />
        );

      case "boolean":
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(fieldDef.id, e.target.checked)}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={String(value ?? "")}
            onChange={(e) => handleFieldChange(fieldDef.id, e.target.value)}
          />
        );

      case "select":
        return (
          <select
            value={String(value ?? "")}
            onChange={(e) => handleFieldChange(fieldDef.id, e.target.value)}
          >
            <option value="">Select...</option>
            {fieldDef.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "multiselect": {
        const selected = Array.isArray(value) ? value : [];
        return (
          <div className="multiselect-field">
            {fieldDef.options?.map((opt) => (
              <label key={opt.value}>
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => {
                    const newValue = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value);
                    handleFieldChange(fieldDef.id, newValue);
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        );
      }

      default:
        return (
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => handleFieldChange(fieldDef.id, e.target.value)}
            placeholder={fieldDef.description}
          />
        );
    }
  };

  return (
    <div className="metadata-editor">
      <div className="metadata-fields">
        {/* Core fields */}
        <div className="metadata-field">
          <label>
            <span>ID</span>
            <input
              type="text"
              value={entity.id}
              onChange={(e) => onUpdate({ id: e.target.value })}
              placeholder="unique-id"
            />
          </label>
        </div>

        <div className="metadata-field">
          <label>
            <span>Name</span>
            <input
              type="text"
              value={entity.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Entity name"
            />
          </label>
        </div>

        <div className="metadata-field">
          <label>
            <span>Type</span>
            {entityTypes.length > 0 ? (
              <select
                value={entity.type}
                onChange={(e) => onUpdate({ type: e.target.value })}
              >
                {entityTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={entity.type}
                onChange={(e) => onUpdate({ type: e.target.value })}
                placeholder="character"
              />
            )}
          </label>
        </div>

        <div className="metadata-field">
          <label>
            <span>Status</span>
            {statuses.length > 0 ? (
              <select
                value={entity.status}
                onChange={(e) => onUpdate({ status: e.target.value })}
              >
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={entity.status}
                onChange={(e) => onUpdate({ status: e.target.value })}
                placeholder="draft"
              />
            )}
          </label>
        </div>

        <div className="metadata-field">
          <label>
            <span>Aliases</span>
            <input
              type="text"
              value={entity.aliases.join(", ")}
              onChange={(e) =>
                onUpdate({
                  aliases: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Alternative names (comma-separated)"
            />
          </label>
        </div>

        {/* Custom fields */}
        {relevantFields.length > 0 && (
          <>
            <div className="metadata-section-divider">
              <span>Custom Fields</span>
            </div>
            {relevantFields.map((fieldDef) => (
              <div key={fieldDef.id} className="metadata-field">
                <label>
                  <span>
                    {fieldDef.label}
                    {fieldDef.required && <span className="required-star">*</span>}
                  </span>
                  {renderCustomField(fieldDef)}
                </label>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

