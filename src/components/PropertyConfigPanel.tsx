import { useMemo, useState } from "react";
import { Eye, EyeOff, GripVertical, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import type {
  BasePropertyDefinition,
  CustomFieldDefinition,
  CustomFieldType,
  PropertiesConfig,
  PropertyDefinition,
} from "../editorTypes";
import { PROPERTY_TEMPLATES, applyPropertyTemplate } from "../utils/propertyTemplates";
import {
  labelFromPropertyId,
  propertyUsesOptions,
  sanitizePropertyId,
  valuesToOptions,
} from "../utils/propertiesConfig";

type PropertyConfigPanelProps = {
  taxonomyConfig: PropertiesConfig;
  onChange: (config: PropertiesConfig) => void;
};

type PropertyRow = {
  id: string;
  label: string;
  type: CustomFieldType;
  description?: string;
  visible: boolean;
  required: boolean;
  readOnly: boolean;
  immutable: boolean;
  source: "base" | "custom";
  definition: PropertyDefinition;
};

const PROPERTY_TYPES: Array<{ value: CustomFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-select" },
  { value: "entity-ref", label: "Entity reference" },
  { value: "entity-ref-list", label: "Entity reference list" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "file", label: "File" },
  { value: "image", label: "Image" },
];

function emptyCustomProperty(): CustomFieldDefinition {
  return {
    id: "",
    label: "",
    type: "text",
    description: "",
    required: false,
  };
}

function propertyRows(config: PropertiesConfig): PropertyRow[] {
  const baseVisible = new Set(config.baseProperties?.visibleByDefault ?? []);
  const customVisible = new Set(config.customFields.globalFields ?? []);
  const baseIds = new Set((config.baseProperties?.definitions ?? []).map((definition) => definition.id));
  const baseRows: PropertyRow[] = (config.baseProperties?.definitions ?? []).map((definition) => ({
    id: definition.id,
    label: definition.label ?? definition.id,
    type: definition.type,
    description: definition.description,
    visible: baseVisible.has(definition.id),
    required: definition.required ?? false,
    readOnly: definition.readOnly ?? false,
    immutable: definition.immutable ?? false,
    source: "base",
    definition,
  }));
  const customRows: PropertyRow[] = (config.customFields.definitions ?? [])
    .filter((definition) => !baseIds.has(definition.id))
    .map((definition) => ({
      id: definition.id,
      label: definition.label,
      type: definition.type,
      description: definition.description,
      visible: customVisible.has(definition.id),
      required: definition.required ?? false,
      readOnly: false,
      immutable: false,
      source: "custom",
      definition,
    }));
  const order = config.baseProperties?.order ?? [];
  return [...baseRows, ...customRows].sort((first, second) => {
    const firstIndex = order.indexOf(first.id);
    const secondIndex = order.indexOf(second.id);
    if (firstIndex === -1 && secondIndex === -1) {
      if (first.source !== second.source) return first.source === "base" ? -1 : 1;
      return first.label.localeCompare(second.label);
    }
    if (firstIndex === -1) return 1;
    if (secondIndex === -1) return -1;
    return firstIndex - secondIndex;
  });
}

export function PropertyConfigPanel({ taxonomyConfig, onChange }: PropertyConfigPanelProps) {
  const [editingProperty, setEditingProperty] = useState<PropertyRow | null>(null);
  const [addingProperty, setAddingProperty] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const rows = useMemo(() => propertyRows(taxonomyConfig), [taxonomyConfig]);

  function setBaseVisible(id: string, visible: boolean) {
    if (!taxonomyConfig.baseProperties) return;
    const current = taxonomyConfig.baseProperties.visibleByDefault ?? [];
    const next = visible ? [...new Set([...current, id])] : current.filter((candidate) => candidate !== id);
    onChange({
      ...taxonomyConfig,
      baseProperties: { ...taxonomyConfig.baseProperties, visibleByDefault: next },
    });
  }

  function setCustomVisible(id: string, visible: boolean) {
    const current = taxonomyConfig.customFields.globalFields ?? [];
    const next = visible ? [...new Set([...current, id])] : current.filter((candidate) => candidate !== id);
    onChange({
      ...taxonomyConfig,
      customFields: { ...taxonomyConfig.customFields, globalFields: next },
    });
  }

  function toggleVisible(row: PropertyRow) {
    if (row.source === "base") setBaseVisible(row.id, !row.visible);
    else setCustomVisible(row.id, !row.visible);
  }

  function saveProperty(property: PropertyDefinition, source: PropertyRow["source"]) {
    if (source === "base") {
      if (!taxonomyConfig.baseProperties) return;
      onChange({
        ...taxonomyConfig,
        baseProperties: {
          ...taxonomyConfig.baseProperties,
          definitions: taxonomyConfig.baseProperties.definitions.map((definition) =>
            definition.id === property.id ? (property as BasePropertyDefinition) : definition,
          ),
        },
      });
    } else {
      const exists = taxonomyConfig.customFields.definitions.some((definition) => definition.id === property.id);
      onChange({
        ...taxonomyConfig,
        customFields: {
          ...taxonomyConfig.customFields,
          definitions: exists
            ? taxonomyConfig.customFields.definitions.map((definition) =>
                definition.id === property.id ? (property as CustomFieldDefinition) : definition,
              )
            : [...taxonomyConfig.customFields.definitions, property as CustomFieldDefinition],
          globalFields: [...new Set([...(taxonomyConfig.customFields.globalFields ?? []), property.id])],
        },
      });
    }
    setEditingProperty(null);
    setAddingProperty(false);
  }

  function deleteCustomProperty(id: string) {
    const confirmed = window.confirm("Remove this property from universe settings? Existing notes will keep their frontmatter until you resolve them in the Inspector.");
    if (!confirmed) return;
    onChange({
      ...taxonomyConfig,
      customFields: {
        ...taxonomyConfig.customFields,
        definitions: taxonomyConfig.customFields.definitions.filter((definition) => definition.id !== id),
        globalFields: (taxonomyConfig.customFields.globalFields ?? []).filter((candidate) => candidate !== id),
      },
    });
  }

  function applyTemplate(templateId: string) {
    const template = PROPERTY_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) return;
    onChange(applyPropertyTemplate(taxonomyConfig, template));
    setShowTemplates(false);
  }

  return (
    <div className="property-config-panel">
      <div className="property-config-header">
        <div>
          <h3>Properties</h3>
          <p>Choose what appears in the Inspector and how each field behaves.</p>
        </div>
        <div className="property-config-actions">
          <button type="button" onClick={() => setShowTemplates(true)}>
            <Sparkles size={14} />
            Template
          </button>
          <button type="button" className="primary" onClick={() => setAddingProperty(true)}>
            <Plus size={14} />
            Add property
          </button>
        </div>
      </div>

      <div className="property-table">
        <div className="property-table-head">
          <span />
          <span>Property</span>
          <span>Type</span>
          <span>Visible</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className={`property-row ${!row.visible ? "muted-row" : ""}`} key={`${row.source}:${row.id}`}>
            <span className="property-drag-handle">
              <GripVertical size={14} />
            </span>
            <div className="property-main-cell">
              <strong>{row.label}</strong>
              <span>{row.id}</span>
              {row.description ? <small>{row.description}</small> : null}
            </div>
            <span className="property-type-pill">{typeLabel(row.type)}</span>
            <button
              type="button"
              className={`property-visibility-toggle ${row.visible ? "active" : ""}`}
              onClick={() => toggleVisible(row)}
              title={row.visible ? "Hide in Inspector" : "Show in Inspector"}
            >
              {row.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              {row.visible ? "Shown" : "Hidden"}
            </button>
            <div className="property-row-actions">
              <button type="button" onClick={() => setEditingProperty(row)} title="Edit property">
                <Settings2 size={14} />
              </button>
              {row.source === "custom" ? (
                <button type="button" className="danger" onClick={() => deleteCustomProperty(row.id)} title="Delete property">
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {addingProperty ? (
        <PropertyEditorDialog
          title="Add property"
          source="custom"
          property={emptyCustomProperty()}
          existingIds={rows.map((row) => row.id)}
          onSave={(property) => saveProperty(property, "custom")}
          onCancel={() => setAddingProperty(false)}
        />
      ) : null}

      {editingProperty ? (
        <PropertyEditorDialog
          title={`Edit ${editingProperty.label}`}
          source={editingProperty.source}
          property={editingProperty.definition}
          existingIds={rows.filter((row) => row.id !== editingProperty.id).map((row) => row.id)}
          onSave={(property) => saveProperty(property, editingProperty.source)}
          onCancel={() => setEditingProperty(null)}
        />
      ) : null}

      {showTemplates ? (
        <div className="property-modal-backdrop">
          <div className="property-modal wide">
            <header>
              <h3>Apply property template</h3>
              <button type="button" onClick={() => setShowTemplates(false)}>
                <X size={15} />
              </button>
            </header>
            <div className="property-template-list">
              {PROPERTY_TEMPLATES.map((template) => (
                <button key={template.id} type="button" onClick={() => applyTemplate(template.id)}>
                  <strong>{template.label}</strong>
                  <span>{template.description}</span>
                  <small>{template.visibleBaseProperties.join(", ")}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PropertyEditorDialog({
  title,
  source,
  property,
  existingIds,
  onSave,
  onCancel,
}: {
  title: string;
  source: "base" | "custom";
  property: PropertyDefinition;
  existingIds: string[];
  onSave: (property: PropertyDefinition) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PropertyDefinition>({ ...property });
  const [optionLabel, setOptionLabel] = useState("");
  const [error, setError] = useState("");
  const isBase = source === "base";

  function updateDraft(patch: Partial<PropertyDefinition>) {
    setDraft((current) => ({ ...current, ...patch }) as PropertyDefinition);
  }

  function save() {
    const id = isBase ? draft.id : sanitizePropertyId(draft.id || draft.label || "");
    if (!id || !draft.label?.trim()) {
      setError("Property needs a label and id.");
      return;
    }
    if (existingIds.includes(id)) {
      setError("A property with this id already exists.");
      return;
    }
    const nextProperty = {
      ...draft,
      id,
      label: draft.label?.trim() || labelFromPropertyId(id),
      options: propertyUsesOptions(draft.type) ? draft.options ?? [] : undefined,
    } as PropertyDefinition;
    onSave(nextProperty);
  }

  function addOption() {
    if (!optionLabel.trim()) return;
    const nextOption = valuesToOptions([optionLabel.trim()])[0];
    updateDraft({ options: [...(draft.options ?? []), nextOption] });
    setOptionLabel("");
  }

  function updateOption(index: number, patch: Partial<{ label: string; value: string; color?: string }>) {
    const options = [...(draft.options ?? [])];
    options[index] = { ...options[index], ...patch };
    updateDraft({ options });
  }

  function removeOption(index: number) {
    updateDraft({ options: (draft.options ?? []).filter((_, optionIndex) => optionIndex !== index) });
  }

  return (
    <div className="property-modal-backdrop">
      <div className="property-modal">
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>
        <div className="property-form-grid">
          <label>
            <span>Label</span>
            <input
              value={draft.label ?? ""}
              onChange={(event) => {
                const label = event.target.value;
                updateDraft({ label, ...(isBase || draft.id ? {} : { id: sanitizePropertyId(label) }) });
              }}
              placeholder="Rarity"
            />
          </label>
          <label>
            <span>ID</span>
            <input
              value={draft.id}
              disabled={isBase}
              onChange={(event) => updateDraft({ id: sanitizePropertyId(event.target.value) })}
              placeholder="rarity"
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={draft.type}
              disabled={isBase && ("immutable" in draft ? draft.immutable : false)}
              onChange={(event) => updateDraft({ type: event.target.value as CustomFieldType, options: [] })}
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Description</span>
            <textarea
              value={draft.description ?? ""}
              onChange={(event) => updateDraft({ description: event.target.value })}
              rows={2}
              placeholder="Shown as helper text in the Inspector"
            />
          </label>
          <div className="property-form-toggles">
            <label>
              <input
                type="checkbox"
                checked={draft.required ?? false}
                disabled={"immutable" in draft && draft.immutable}
                onChange={(event) => updateDraft({ required: event.target.checked })}
              />
              Required
            </label>
            {"readOnly" in draft ? (
              <label>
                <input
                  type="checkbox"
                  checked={draft.readOnly ?? false}
                  disabled={draft.immutable}
                  onChange={(event) => updateDraft({ readOnly: event.target.checked })}
                />
                Read-only
              </label>
            ) : null}
          </div>

          {propertyUsesOptions(draft.type) ? (
            <div className="property-options-editor">
              <span>Options</span>
              {(draft.options ?? []).map((option, index) => (
                <div className="property-option-row" key={`${option.value}-${index}`}>
                  <input
                    value={option.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      updateOption(index, { label, value: sanitizePropertyId(label) || option.value });
                    }}
                    placeholder="Legendary"
                  />
                  <input
                    value={option.value}
                    onChange={(event) => updateOption(index, { value: sanitizePropertyId(event.target.value) })}
                    placeholder="legendary"
                  />
                  <input
                    type="color"
                    value={option.color ?? "#3f7f64"}
                    onChange={(event) => updateOption(index, { color: event.target.value })}
                    title="Option color"
                  />
                  <button type="button" className="danger" onClick={() => removeOption(index)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="property-option-add">
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
          ) : null}
        </div>
        {error ? <p className="property-form-error">{error}</p> : null}
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save}>
            Save property
          </button>
        </footer>
      </div>
    </div>
  );
}

function typeLabel(type: CustomFieldType) {
  return PROPERTY_TYPES.find((candidate) => candidate.value === type)?.label ?? type;
}
