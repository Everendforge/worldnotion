import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, FolderTree, GitBranch, Plus, Trash2, X } from "lucide-react";
import type { CustomFieldDefinition, CustomFieldType, PropertiesConfig, PropertyDefinition } from "../editorTypes";
import {
  buildPropertySchemaSections,
  flattenPropertyDefinitions,
  type PropertySchemaTreeNode,
  listAllProperties,
  listVisibleProperties,
  moveInspectorProperty,
  propertyUsesOptions,
  removeInspectorProperty,
  reorderInspectorPropertySiblings,
  setInspectorPropertyVisibility,
  uniquePropertyId,
  upsertInspectorProperty,
  valuesToOptions,
} from "../utils/propertiesConfig";
import { getPropertyPath } from "../utils/propertyTreeUtils";

type PropertyManagerModalProps = {
  propertiesConfig: PropertiesConfig;
  entityType: string;
  initialPropertyId?: string;
  onChange: (config: PropertiesConfig) => void;
  onClose: () => void;
};

type EditableOption = { value: string; label: string; color?: string };

const PROPERTY_TYPES: Array<{ value: CustomFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-select" },
  { value: "entity-ref", label: "Entity ref" },
  { value: "entity-ref-list", label: "Entity ref list" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "file", label: "File" },
  { value: "image", label: "Image" },
  { value: "group", label: "Group" },
];

function toCustomDefinition(property: PropertyDefinition): CustomFieldDefinition {
  const { hidden: _hidden, immutable: _immutable, readOnly: _readOnly, ...customProperty } =
    property as PropertyDefinition & { hidden?: boolean; immutable?: boolean; readOnly?: boolean };
  return {
    ...customProperty,
    label: customProperty.label ?? customProperty.id,
  } as CustomFieldDefinition;
}

function typeLabel(type: CustomFieldType) {
  return PROPERTY_TYPES.find((candidate) => candidate.value === type)?.label ?? type;
}

function duplicatePropertyBranch(
  property: PropertyDefinition,
  existingIds: Set<string>,
  idMap = new Map<string, string>(),
  root = true,
): CustomFieldDefinition {
  const label = root ? `${property.label ?? property.id} copy` : property.label ?? property.id;
  const id = uniquePropertyId(label, existingIds);
  existingIds.add(id);
  idMap.set(property.id, id);
  const visibleWhen = property.visibleWhen
    ? Object.fromEntries(Object.entries(property.visibleWhen).map(([parentId, values]) => [idMap.get(parentId) ?? parentId, values]))
    : undefined;
  return {
    ...toCustomDefinition(property),
    id,
    label,
    visibleWhen,
    children: property.children?.map((child) => duplicatePropertyBranch(child, existingIds, idMap, false)),
  };
}

export function PropertyManagerModal({
  propertiesConfig,
  entityType,
  initialPropertyId,
  onChange,
  onClose,
}: PropertyManagerModalProps) {
  const allProperties = useMemo(() => listAllProperties(propertiesConfig), [propertiesConfig]);
  const visibleProperties = useMemo(() => listVisibleProperties(propertiesConfig, entityType), [entityType, propertiesConfig]);
  const visibleIds = useMemo(
    () => new Set(visibleProperties.flatMap((property) => flattenPropertyDefinitions([property]).map((definition) => definition.id))),
    [visibleProperties],
  );
  const existingIds = useMemo(() => allProperties.map((property) => property.id), [allProperties]);
  const [selectedId, setSelectedId] = useState(initialPropertyId ?? visibleProperties[0]?.id ?? allProperties[0]?.id);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<CustomFieldType>("text");
  const [optionLabel, setOptionLabel] = useState("");
  const [newChildLabel, setNewChildLabel] = useState("");
  const [newChildType, setNewChildType] = useState<CustomFieldType>("text");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const selectedProperty = allProperties.find((property) => property.id === selectedId) ?? allProperties[0];
  const roots = [
    ...(propertiesConfig.baseProperties?.definitions ?? []),
    ...(propertiesConfig.customFields.definitions ?? []),
  ];
  const selectedPath = selectedProperty ? getPropertyPath(roots, selectedProperty.id) : [];
  const selectedParentId = selectedPath.length > 1 ? selectedPath[selectedPath.length - 2] : "";
  const parentCandidates = allProperties.filter(
    (property) => property.id !== selectedProperty?.id && !getPropertyPath(roots, property.id).includes(selectedProperty?.id ?? ""),
  );
  const propertySections = useMemo(
    () => buildPropertySchemaSections(propertiesConfig, entityType, { includeHidden: true }),
    [entityType, propertiesConfig],
  );

  function saveConfig(nextConfig: PropertiesConfig, nextSelectedId = selectedId) {
    onChange(nextConfig);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }

  function createProperty() {
    const label = newLabel.trim();
    if (!label) return;
    const id = uniquePropertyId(label, existingIds);
    const property: CustomFieldDefinition = {
      id,
      label,
      type: newType,
      required: false,
      options: propertyUsesOptions(newType) ? [] : undefined,
    };
    saveConfig(upsertInspectorProperty(propertiesConfig, property, entityType), id);
    setNewLabel("");
    setNewType("text");
  }

  function createChildProperty() {
    if (!selectedProperty) return;
    const label = newChildLabel.trim();
    if (!label) return;
    const id = uniquePropertyId(label, existingIds);
    const property: CustomFieldDefinition = {
      id,
      label,
      type: newChildType,
      required: false,
      options: propertyUsesOptions(newChildType) ? [] : undefined,
    };
    saveConfig(upsertInspectorProperty(propertiesConfig, property, entityType, selectedProperty.id), id);
    setNewChildLabel("");
    setNewChildType("text");
  }

  function updateSelected(patch: Partial<CustomFieldDefinition>) {
    if (!selectedProperty) return;
    const nextProperty = {
      ...toCustomDefinition(selectedProperty),
      ...patch,
      options: propertyUsesOptions(patch.type ?? selectedProperty.type)
        ? patch.options ?? selectedProperty.options ?? []
        : undefined,
    };
    saveConfig(upsertInspectorProperty(propertiesConfig, nextProperty, entityType, selectedParentId || undefined));
  }

  function duplicateSelected() {
    if (!selectedProperty) return;
    const copy = duplicatePropertyBranch(selectedProperty, new Set(existingIds));
    saveConfig(upsertInspectorProperty(propertiesConfig, copy, entityType), copy.id);
  }

  function deleteSelected() {
    if (!selectedProperty) return;
    const confirmed = window.confirm("Delete this property from universe properties? Existing note values will stay as unconfigured fields.");
    if (!confirmed) return;
    const nextConfig = removeInspectorProperty(propertiesConfig, selectedProperty.id);
    const nextSelected = listVisibleProperties(nextConfig, entityType)[0]?.id ?? listAllProperties(nextConfig)[0]?.id;
    saveConfig(nextConfig, nextSelected);
  }

  function toggleVisible(propertyId: string) {
    saveConfig(setInspectorPropertyVisibility(propertiesConfig, entityType, propertyId, !visibleIds.has(propertyId)), propertyId);
  }

  function moveSelectedParent(parentId: string) {
    if (!selectedProperty) return;
    saveConfig(moveInspectorProperty(propertiesConfig, entityType, selectedProperty.id, parentId || null));
  }

  function updateDependency(parentId: string, values: string[]) {
    if (!selectedProperty) return;
    const nextVisibleWhen = parentId && values.length ? { [parentId]: values } : undefined;
    updateSelected({ visibleWhen: nextVisibleWhen });
  }

  function chooseDependencyParent(parentId: string) {
    if (!selectedProperty || !parentId) {
      updateSelected({ visibleWhen: undefined });
      return;
    }
    const parent = allProperties.find((property) => property.id === parentId);
    const firstOption = parent?.options?.[0]?.value;
    updateDependency(parentId, firstOption ? [firstOption] : []);
  }

  function moveSelectedOrder(direction: "up" | "down") {
    if (!selectedProperty) return;
    const index = visibleProperties.findIndex((property) => property.id === selectedProperty.id);
    const target = direction === "up" ? visibleProperties[index - 1] : visibleProperties[index + 1];
    if (!target) return;
    const nextConfig =
      direction === "up"
        ? reorderInspectorPropertySiblings(propertiesConfig, entityType, selectedProperty.id, target.id)
        : reorderInspectorPropertySiblings(propertiesConfig, entityType, target.id, selectedProperty.id);
    saveConfig(nextConfig);
  }

  function addOption() {
    if (!selectedProperty || !optionLabel.trim()) return;
    updateSelected({ options: [...(selectedProperty.options ?? []), valuesToOptions([optionLabel.trim()])[0]] });
    setOptionLabel("");
  }

  function updateOption(index: number, patch: Partial<EditableOption>) {
    if (!selectedProperty) return;
    const options = [...(selectedProperty.options ?? [])];
    options[index] = { ...options[index], ...patch };
    updateSelected({ options });
  }

  function renderTreeNode(node: PropertySchemaTreeNode): React.ReactNode {
    const property = node.property;
    const visible = visibleIds.has(property.id);
    return (
      <div key={property.id} className="property-manager-tree-node">
        <button
          type="button"
          className={`property-manager-row ${selectedProperty?.id === property.id ? "active" : ""} ${visible ? "" : "muted"}`}
          style={{ "--property-depth": node.depth } as CSSProperties}
          onClick={() => setSelectedId(property.id)}
        >
          <span className="property-manager-check">{visible ? <Check size={13} /> : null}</span>
          <span className="property-manager-branch-icon">{node.children.length ? <FolderTree size={13} /> : <GitBranch size={13} />}</span>
          <span>
            <strong>{property.label ?? property.id}</strong>
            <small>{visible ? typeLabel(property.type) : `${typeLabel(property.type)} · hidden`}</small>
          </span>
        </button>
        {node.children.length ? <div className="property-manager-tree-children">{node.children.map((child) => renderTreeNode(child))}</div> : null}
      </div>
    );
  }

  return (
    <div className="property-manager-backdrop" role="dialog" aria-modal="true" aria-label="Customize properties">
      <div className="property-manager-modal">
        <header className="property-manager-header">
          <div>
            <p>Inspector properties</p>
            <h3>{entityType}</h3>
          </div>
          <button type="button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="property-manager-body">
          <aside className="property-manager-list property-manager-tree">
            <div className="property-manager-create">
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createProperty();
                  }
                }}
                placeholder="New property"
                aria-label="New property name"
              />
              <select value={newType} onChange={(event) => setNewType(event.target.value as CustomFieldType)} aria-label="New property type">
                {PROPERTY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <button type="button" className="primary" onClick={createProperty}>
                <Plus size={14} />
                Add
              </button>
            </div>

            <div className="property-manager-rows">
              {propertySections
                .filter((section) => section.nodes.length > 0)
                .map((section) => {
                  const isCollapsed = collapsedSections.has(section.id);
                  return (
                  <section key={section.id} className={`property-manager-tree-section property-manager-tree-section-${section.kind}`}>
                    <button
                      type="button"
                      className="property-manager-tree-section-title"
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
                    {!isCollapsed ? section.nodes.map((node) => renderTreeNode(node)) : null}
                  </section>
                  );
                })}
            </div>
          </aside>

          <section className="property-manager-detail">
            {selectedProperty ? (
              <>
                <div className="property-manager-detail-header">
                  <div>
                    <p>{visibleIds.has(selectedProperty.id) ? "Shown in this note type" : "Hidden from this note type"}</p>
                    <h4>{selectedProperty.label ?? selectedProperty.id}</h4>
                  </div>
                  <button type="button" onClick={() => toggleVisible(selectedProperty.id)}>
                    {visibleIds.has(selectedProperty.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    {visibleIds.has(selectedProperty.id) ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="property-manager-form">
                  <label>
                    <span>Name</span>
                    <input value={selectedProperty.label ?? ""} onChange={(event) => updateSelected({ label: event.target.value })} />
                  </label>
                  <label>
                    <span>Type</span>
                    <select value={selectedProperty.type} onChange={(event) => updateSelected({ type: event.target.value as CustomFieldType })}>
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Parent / Location</span>
                    <select value={selectedParentId} onChange={(event) => moveSelectedParent(event.target.value)}>
                      <option value="">Root level</option>
                      {parentCandidates.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.label ?? property.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="property-manager-dependency-panel">
                    <span>Dependency rule</span>
                    <label>
                      <span>Depends on</span>
                      <select
                        value={Object.keys(selectedProperty.visibleWhen ?? {})[0] ?? ""}
                        onChange={(event) => chooseDependencyParent(event.target.value)}
                      >
                        <option value="">No dependency</option>
                        {allProperties
                          .filter((property) => property.id !== selectedProperty.id && (property.type === "select" || property.type === "multiselect"))
                          .map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.label ?? property.id}
                            </option>
                          ))}
                      </select>
                    </label>
                    {Object.keys(selectedProperty.visibleWhen ?? {})[0] ? (
                      <div className="property-manager-dependency-values">
                        {(() => {
                          const parentId = Object.keys(selectedProperty.visibleWhen ?? {})[0];
                          const parent = allProperties.find((property) => property.id === parentId);
                          const values = selectedProperty.visibleWhen?.[parentId] ?? [];
                          return (parent?.options ?? []).map((option) => (
                            <label key={option.value} className="property-manager-checkbox">
                              <input
                                type="checkbox"
                                checked={values.includes(option.value)}
                                onChange={(event) => {
                                  const nextValues = event.target.checked
                                    ? [...values, option.value]
                                    : values.filter((value) => value !== option.value);
                                  updateDependency(parentId, nextValues);
                                }}
                              />
                              <span>{option.label}</span>
                            </label>
                          ));
                        })()}
                      </div>
                    ) : null}
                  </div>
                  <label>
                    <span>Description</span>
                    <textarea
                      value={selectedProperty.description ?? ""}
                      onChange={(event) => updateSelected({ description: event.target.value })}
                      rows={3}
                    />
                  </label>
                  <label className="property-manager-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedProperty.required ?? false}
                      onChange={(event) => updateSelected({ required: event.target.checked })}
                    />
                    <span>Required</span>
                  </label>

                  {propertyUsesOptions(selectedProperty.type) ? (
                    <div className="property-manager-options">
                      <span>Options</span>
                      {(selectedProperty.options ?? []).map((option, index) => (
                        <div key={`${option.value}-${index}`} className="property-manager-option-row">
                          <input value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} />
                          <input value={option.value} onChange={(event) => updateOption(index, { value: event.target.value })} />
                          <input
                            type="color"
                            value={option.color ?? "#64748b"}
                            onChange={(event) => updateOption(index, { color: event.target.value })}
                            title="Color"
                          />
                          <button
                            type="button"
                            className="danger"
                            onClick={() => updateSelected({ options: (selectedProperty.options ?? []).filter((_, optionIndex) => optionIndex !== index) })}
                            title="Delete option"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <div className="property-manager-option-add">
                        <input
                          value={optionLabel}
                          onChange={(event) => setOptionLabel(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addOption();
                            }
                          }}
                          placeholder="New option"
                        />
                        <button type="button" onClick={addOption}>
                          <Plus size={13} />
                          Add option
                        </button>
                      </div>
                    </div>
                  ) : selectedProperty.type !== "group" ? (
                    <p className="property-manager-warning">Changing property type updates the schema only. Existing frontmatter values are kept as-is.</p>
                  ) : null}

                  <div className="property-manager-children-panel">
                    <span>Children</span>
                    {selectedProperty.children?.length ? (
                      <div className="property-manager-child-list">
                        {selectedProperty.children.map((child) => (
                          <button key={child.id} type="button" onClick={() => setSelectedId(child.id)}>
                            <GitBranch size={13} />
                            <span>{child.label ?? child.id}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="property-manager-warning">No child properties yet.</p>
                    )}
                    <div className="property-manager-child-create">
                      <input
                        value={newChildLabel}
                        onChange={(event) => setNewChildLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            createChildProperty();
                          }
                        }}
                        placeholder="New child property"
                        aria-label="New child property name"
                      />
                      <select value={newChildType} onChange={(event) => setNewChildType(event.target.value as CustomFieldType)} aria-label="New child property type">
                        {PROPERTY_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={createChildProperty}>
                        <Plus size={13} />
                        Add child
                      </button>
                    </div>
                  </div>

                  <details className="property-manager-advanced">
                    <summary>Advanced</summary>
                    <label>
                      <span>ID</span>
                      <input value={selectedProperty.id} readOnly />
                    </label>
                  </details>
                </div>

                <footer className="property-manager-actions">
                  <button type="button" onClick={() => moveSelectedOrder("up")} disabled={visibleProperties[0]?.id === selectedProperty.id}>
                    <ArrowUp size={14} />
                    Up
                  </button>
                  <button type="button" onClick={() => moveSelectedOrder("down")} disabled={visibleProperties[visibleProperties.length - 1]?.id === selectedProperty.id}>
                    <ArrowDown size={14} />
                    Down
                  </button>
                  <button type="button" onClick={duplicateSelected}>
                    <Copy size={14} />
                    Duplicate
                  </button>
                  <button type="button" onClick={() => moveSelectedParent("")} disabled={!selectedParentId}>
                    <FolderTree size={14} />
                    Make root
                  </button>
                  <button type="button" onClick={() => toggleVisible(selectedProperty.id)}>
                    <EyeOff size={14} />
                    Remove from this type
                  </button>
                  <button type="button" className="danger" onClick={deleteSelected}>
                    <Trash2 size={14} />
                    Delete from universe
                  </button>
                </footer>
              </>
            ) : (
              <div className="property-manager-empty">Create a property to start shaping this note type.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
