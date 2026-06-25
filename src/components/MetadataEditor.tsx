import { useMemo, useState } from "react";
import { EyeOff, GripVertical, Plus, SlidersHorizontal, Trash2, Wand2, X } from "lucide-react";
import type { Entity } from "../domain";
import type { PropertiesConfig, BasePropertyDefinition, CustomFieldDefinition } from "../editorTypes";
import {
  adaptFrontmatterProperty,
  inferPropertyDefinition,
  listAllProperties,
  listUnconfiguredProperties,
  listVisibleProperties,
  parseFrontmatterRaw,
  removeFrontmatterProperty,
} from "../utils/propertiesConfig";
import { PropertyFieldRenderer } from "./PropertyFieldRenderer";

type MetadataEditorProps = {
  entity: Entity;
  taxonomyConfig?: PropertiesConfig;
  rawYaml: string;
  onUpdate: (updates: Partial<Entity>) => void;
  onUpdateRawYaml?: (yaml: string) => void;
  onAddPropertyToUniverse?: (property: CustomFieldDefinition) => void | Promise<void>;
  onUpdatePropertiesConfig?: (properties: PropertiesConfig) => void | Promise<void>;
  onOpenPropertiesSettings?: () => void;
};

type EditableOption = { value: string; label: string; color?: string };

const ENTITY_FRONTMATTER_FIELD_IDS = new Set(["id", "name", "type", "status", "tags", "aliases", "parentId", "childrenIds", "folder"]);
const PROTECTED_INSPECTOR_PROPERTY_IDS = new Set(["id", "name", "type"]);
const HIDDEN_FROM_INSPECTOR_PROPERTY_IDS = new Set(["folder", "tags"]);

function formatPreviewValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function MetadataEditor({
  entity,
  taxonomyConfig,
  rawYaml,
  onUpdate,
  onUpdateRawYaml,
  onAddPropertyToUniverse,
  onUpdatePropertiesConfig,
  onOpenPropertiesSettings,
}: MetadataEditorProps) {
  const [adaptTargets, setAdaptTargets] = useState<Record<string, string>>({});
  const [draggedPropertyId, setDraggedPropertyId] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState<{ propertyId: string; options: EditableOption[] } | null>(null);
  const [propertyContextMenu, setPropertyContextMenu] = useState<{ x: number; y: number } | null>(null);

  const entityTypes = taxonomyConfig?.entityTypes.definitions ?? [];
  const statuses = taxonomyConfig?.statuses.definitions ?? [];
  const customFieldDefs = taxonomyConfig?.customFields.definitions ?? [];
  const basePropertyDefs = taxonomyConfig?.baseProperties?.definitions ?? [];
  const frontmatterData = useMemo(() => parseFrontmatterRaw(rawYaml), [rawYaml]);
  const configuredProperties = useMemo(() => listAllProperties(taxonomyConfig), [taxonomyConfig]);

  // Get entity type definition
  const entityTypeDef = entityTypes.find((t) => t.id === entity.type);

  // Determine which properties to show
  const visibleProperties = useMemo(() => {
    if (basePropertyDefs.length > 0) {
      return listVisibleProperties(taxonomyConfig, entity.type);
    }

    // Backward compatibility: no baseProperties defined, use legacy behavior
    return null;
  }, [basePropertyDefs.length, entity.type, taxonomyConfig]);

  const inspectorProperties = useMemo(
    () => visibleProperties?.filter((property) => !HIDDEN_FROM_INSPECTOR_PROPERTY_IDS.has(property.id)) ?? null,
    [visibleProperties],
  );

  const unconfiguredProperties = useMemo(
    () => listUnconfiguredProperties(frontmatterData, taxonomyConfig),
    [frontmatterData, taxonomyConfig],
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
    if (ENTITY_FRONTMATTER_FIELD_IDS.has(property.id)) {
      return (entity as any)[property.id];
    }
    
    // Otherwise get from customProperties
    return entity.customProperties[property.id];
  };

  const removeUnconfiguredProperty = (key: string) => {
    if (!onUpdateRawYaml) return;
    onUpdateRawYaml(removeFrontmatterProperty(rawYaml, key));
  };

  const adaptUnconfiguredProperty = (key: string) => {
    if (!onUpdateRawYaml) return;
    const target = adaptTargets[key];
    if (!target || target === key) return;
    onUpdateRawYaml(adaptFrontmatterProperty(rawYaml, key, target));
  };

  const addUnconfiguredPropertyToUniverse = (key: string, value: unknown) => {
    const property = inferPropertyDefinition(key, value);
    void onAddPropertyToUniverse?.(property);
  };

  const saveConfig = (nextConfig: PropertiesConfig) => {
    void onUpdatePropertiesConfig?.(nextConfig);
  };

  const allInspectableProperties = useMemo(
    () => configuredProperties.filter((property) => !HIDDEN_FROM_INSPECTOR_PROPERTY_IDS.has(property.id)),
    [configuredProperties],
  );

  const visiblePropertyIds = useMemo(
    () => new Set(inspectorProperties?.map((property) => property.id) ?? []),
    [inspectorProperties],
  );

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
    if (!taxonomyConfig) return;
    const normalizedOptions = options
      .map((option) => ({
        value: option.value.trim(),
        label: option.label.trim() || option.value.trim(),
        color: option.color?.trim() || undefined,
      }))
      .filter((option) => option.value.length > 0);

    if (property.id === "type") {
      const existingById = new Map(taxonomyConfig.entityTypes.definitions.map((definition) => [definition.id, definition]));
      const definitions = normalizedOptions.map((option) => ({
        ...(existingById.get(option.value) ?? { id: option.value, customFields: [] }),
        id: option.value,
        label: option.label,
        color: option.color,
      }));
      saveConfig({
        ...taxonomyConfig,
        entityTypes: {
          ...taxonomyConfig.entityTypes,
          definitions,
          defaultType: definitions.some((definition) => definition.id === taxonomyConfig.entityTypes.defaultType)
            ? taxonomyConfig.entityTypes.defaultType
            : definitions[0]?.id ?? taxonomyConfig.entityTypes.defaultType,
        },
      });
      return;
    }

    if (property.id === "status") {
      const existingById = new Map(taxonomyConfig.statuses.definitions.map((definition) => [definition.id, definition]));
      const definitions = normalizedOptions.map((option, index) => ({
        ...(existingById.get(option.value) ?? { id: option.value }),
        id: option.value,
        label: option.label,
        color: option.color,
        order: index,
      }));
      saveConfig({
        ...taxonomyConfig,
        statuses: {
          ...taxonomyConfig.statuses,
          definitions,
          defaultStatus: definitions.some((definition) => definition.id === taxonomyConfig.statuses.defaultStatus)
            ? taxonomyConfig.statuses.defaultStatus
            : definitions[0]?.id ?? taxonomyConfig.statuses.defaultStatus,
        },
      });
      return;
    }

    if ("immutable" in property) {
      saveConfig({
        ...taxonomyConfig,
        baseProperties: taxonomyConfig.baseProperties
          ? {
              ...taxonomyConfig.baseProperties,
              definitions: taxonomyConfig.baseProperties.definitions.map((definition) =>
                definition.id === property.id ? { ...definition, options: normalizedOptions } : definition,
              ),
            }
          : taxonomyConfig.baseProperties,
      });
      return;
    }

    saveConfig({
      ...taxonomyConfig,
      customFields: {
        ...taxonomyConfig.customFields,
        definitions: taxonomyConfig.customFields.definitions.map((definition) =>
          definition.id === property.id ? { ...definition, options: normalizedOptions } : definition,
        ),
      },
    });
  };

  const hideProperty = (propertyId: string) => {
    if (!taxonomyConfig?.baseProperties) return;
    const currentVisible = inspectorProperties?.map((property) => property.id).filter((id) => id !== propertyId) ?? [];

    saveConfig({
      ...taxonomyConfig,
      baseProperties: {
        ...taxonomyConfig.baseProperties,
        visibleByDefault: (taxonomyConfig.baseProperties.visibleByDefault ?? []).filter((id) => id !== propertyId),
      },
      customFields: {
        ...taxonomyConfig.customFields,
        globalFields: (taxonomyConfig.customFields.globalFields ?? []).filter((id) => id !== propertyId),
      },
      entityTypes: {
        ...taxonomyConfig.entityTypes,
        definitions: taxonomyConfig.entityTypes.definitions.map((definition) =>
          definition.id === entity.type
            ? {
                ...definition,
                visibleProperties: currentVisible,
                customFields: (definition.customFields ?? []).filter((id) => id !== propertyId),
              }
            : definition,
        ),
      },
    });
  };

  const showProperty = (propertyId: string) => {
    if (!taxonomyConfig?.baseProperties || !inspectorProperties) return;
    const currentVisible = inspectorProperties.map((property) => property.id);
    if (currentVisible.includes(propertyId)) return;
    const nextVisible = [...currentVisible, propertyId];

    saveConfig({
      ...taxonomyConfig,
      baseProperties: {
        ...taxonomyConfig.baseProperties,
        visibleByDefault: PROTECTED_INSPECTOR_PROPERTY_IDS.has(propertyId)
          ? [...new Set([...(taxonomyConfig.baseProperties.visibleByDefault ?? []), propertyId])]
          : taxonomyConfig.baseProperties.visibleByDefault ?? [],
      },
      customFields: {
        ...taxonomyConfig.customFields,
        globalFields: [...new Set([...(taxonomyConfig.customFields.globalFields ?? []), propertyId])],
      },
      entityTypes: {
        ...taxonomyConfig.entityTypes,
        definitions: taxonomyConfig.entityTypes.definitions.map((definition) =>
          definition.id === entity.type
            ? {
                ...definition,
                visibleProperties: nextVisible,
                propertyOrder: nextVisible,
              }
            : definition,
        ),
      },
    });
  };

  const togglePropertyVisibility = (propertyId: string) => {
    if (PROTECTED_INSPECTOR_PROPERTY_IDS.has(propertyId)) return;
    if (visiblePropertyIds.has(propertyId)) {
      hideProperty(propertyId);
    } else {
      showProperty(propertyId);
    }
  };

  const reorderProperty = (targetPropertyId: string) => {
    if (!taxonomyConfig?.baseProperties || !draggedPropertyId || draggedPropertyId === targetPropertyId || !inspectorProperties) return;
    const currentOrder = inspectorProperties.map((property) => property.id);
    const withoutDragged = currentOrder.filter((id) => id !== draggedPropertyId);
    const targetIndex = withoutDragged.indexOf(targetPropertyId);
    if (targetIndex === -1) return;
    withoutDragged.splice(targetIndex, 0, draggedPropertyId);
    const remainingOrder = (taxonomyConfig.baseProperties.order ?? []).filter((id) => !withoutDragged.includes(id));
    const nextOrder = [...withoutDragged, ...remainingOrder];

    saveConfig({
      ...taxonomyConfig,
      baseProperties: {
        ...taxonomyConfig.baseProperties,
        order: nextOrder,
      },
      entityTypes: {
        ...taxonomyConfig.entityTypes,
        definitions: taxonomyConfig.entityTypes.definitions.map((definition) =>
          definition.id === entity.type ? { ...definition, propertyOrder: nextOrder } : definition,
        ),
      },
    });
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

  const renderOptionsPopup = () => {
    if (!optionDraft || !inspectorProperties) return null;
    const property = inspectorProperties.find((candidate) => candidate.id === optionDraft.propertyId);
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
    return (
      <div
        className="context-menu inspector-property-context-menu"
        style={{ left: `${propertyContextMenu.x}px`, top: `${propertyContextMenu.y}px` }}
        role="menu"
      >
        <button
          type="button"
          className="context-menu-item"
          onClick={() => {
            setPropertyContextMenu(null);
            onOpenPropertiesSettings?.();
          }}
        >
          <SlidersHorizontal size={16} />
          <span>Properties settings</span>
        </button>
        <div className="context-menu-separator" />
        {allInspectableProperties.map((property) => {
          const visible = visiblePropertyIds.has(property.id);
          const protectedProperty = PROTECTED_INSPECTOR_PROPERTY_IDS.has(property.id);
          return (
            <button
              key={property.id}
              type="button"
              className="context-menu-item"
              disabled={protectedProperty}
              onClick={() => {
                togglePropertyVisibility(property.id);
                setPropertyContextMenu(null);
              }}
            >
              <span className="context-menu-check">{visible ? "✓" : ""}</span>
              <span>{property.label || property.id}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // Use new property system if available, otherwise fall back to legacy
  if (inspectorProperties) {
    return (
      <div className="metadata-editor" onClick={(event) => {
        if (!(event.target as HTMLElement).closest(".inspector-local-popover, .metadata-field-options")) {
          closeOptionsPopup();
        }
        if (!(event.target as HTMLElement).closest(".inspector-property-context-menu")) {
          setPropertyContextMenu(null);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setPropertyContextMenu({ x: event.clientX, y: event.clientY });
      }}>
        {renderOptionsPopup()}
        {renderPropertyContextMenu()}
        <div className="metadata-fields">
          {inspectorProperties.map((property) => {
            const value = getPropertyValue(property);
            const options = getPropertyOptions(property);
            const isReadOnly = "readOnly" in property && property.readOnly;

            return (
              <div
                key={property.id}
                className={`metadata-field metadata-field-row ${draggedPropertyId === property.id ? "dragging" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderProperty(property.id)}
              >
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
                <label>
                  <span>{property.label || property.id}{property.required && <span className="required-star">*</span>}</span>
                  <PropertyFieldRenderer
                    property={property}
                    value={value}
                    onChange={(newValue) => handlePropertyChange(property.id, newValue)}
                    readOnly={isReadOnly}
                    entityType={entity.type}
                    availableOptions={options}
                  />
                </label>
                <div className="metadata-field-actions">
                  {propertyCanEditOptions(property) ? (
                    <button
                      type="button"
                      className="metadata-field-options"
                      aria-expanded={optionDraft?.propertyId === property.id}
                      onClick={() =>
                        optionDraft?.propertyId === property.id ? closeOptionsPopup() : openOptionsPopup(property)
                      }
                      title="Edit dropdown options"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                  ) : null}
                  {!PROTECTED_INSPECTOR_PROPERTY_IDS.has(property.id) ? (
                    <button type="button" onClick={() => hideProperty(property.id)} title="Hide property">
                      <EyeOff size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

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
                      onClick={() => addUnconfiguredPropertyToUniverse(property.key, property.value)}
                      title="Add to universe properties"
                    >
                      <Plus size={13} />
                      Add
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
    ...(taxonomyConfig?.customFields.globalFields ?? []),
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

      case "multiselect":
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
