import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import type { CustomFieldDefinition, CustomFieldType } from "../editorTypes";

type CustomFieldEditorProps = {
  fields: CustomFieldDefinition[];
  onChange: (fields: CustomFieldDefinition[]) => void;
};

type FieldItemProps = {
  field: CustomFieldDefinition;
  onUpdate: (field: CustomFieldDefinition) => void;
  onDelete: (fieldId: string) => void;
};

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  select: "Select (dropdown)",
  multiselect: "Multi-select",
  "entity-ref": "Entity Reference",
  "entity-ref-list": "Entity Reference List",
  url: "URL",
  email: "Email",
  phone: "Phone",
  file: "File",
  image: "Image",
};

function FieldItem({ field, onUpdate, onDelete }: FieldItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CustomFieldDefinition>(field);
  const [optionInput, setOptionInput] = useState("");

  const handleSave = () => {
    if (!draft.id.trim() || !draft.label.trim()) {
      alert("ID and Label are required");
      return;
    }
    onUpdate(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(field);
    setIsEditing(false);
  };

  const handleAddOption = () => {
    if (!optionInput.trim()) return;
    const newOption = {
      value: optionInput.toLowerCase().replace(/\s+/g, "-"),
      label: optionInput.trim(),
    };
    setDraft({
      ...draft,
      options: [...(draft.options ?? []), newOption],
    });
    setOptionInput("");
  };

  const handleRemoveOption = (value: string) => {
    setDraft({
      ...draft,
      options: draft.options?.filter((opt) => opt.value !== value),
    });
  };

  const needsOptions = draft.type === "select" || draft.type === "multiselect";
  const needsTargetTypes = draft.type === "entity-ref" || draft.type === "entity-ref-list";

  return (
    <div className="custom-field-item">
      {isEditing ? (
        <div className="custom-field-edit">
          <div className="custom-field-edit-row">
            <label>
              <span>Label:</span>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Hit Points"
              />
            </label>
            <label>
              <span>ID:</span>
              <input
                type="text"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="hp"
                pattern="[a-z0-9-_]+"
              />
            </label>
          </div>

          <label>
            <span>Type:</span>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })}>
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Description:</span>
            <input
              type="text"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Optional description"
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={draft.required ?? false}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
            Required field
          </label>

          {draft.type === "number" && (
            <div className="custom-field-edit-row">
              <label>
                <span>Min:</span>
                <input
                  type="number"
                  value={draft.min ?? ""}
                  onChange={(e) => setDraft({ ...draft, min: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="No min"
                />
              </label>
              <label>
                <span>Max:</span>
                <input
                  type="number"
                  value={draft.max ?? ""}
                  onChange={(e) => setDraft({ ...draft, max: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="No max"
                />
              </label>
            </div>
          )}

          {draft.type === "text" && (
            <label>
              <span>Pattern (regex):</span>
              <input
                type="text"
                value={draft.pattern ?? ""}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="Optional regex pattern"
              />
            </label>
          )}

          {needsOptions && (
            <div className="custom-field-options">
              <span>Options:</span>
              <div className="options-list">
                {draft.options?.map((opt) => (
                  <div key={opt.value} className="option-item">
                    <span>{opt.label}</span>
                    <button type="button" onClick={() => handleRemoveOption(opt.value)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="option-add">
                <input
                  type="text"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="Add option..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddOption();
                  }}
                />
                <button type="button" onClick={handleAddOption}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {needsTargetTypes && (
            <label>
              <span>Target Entity Types (comma-separated):</span>
              <input
                type="text"
                value={draft.targetTypes?.join(", ") ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    targetTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="character, location"
              />
            </label>
          )}

          <div className="custom-field-actions">
            <button type="button" onClick={handleSave}>
              Save
            </button>
            <button type="button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="custom-field-info">
            <div>
              <strong>{field.label}</strong>
              {field.required && <span className="required-badge">Required</span>}
              <span className="field-id">({field.id})</span>
              <span className="field-type">{FIELD_TYPE_LABELS[field.type]}</span>
              {field.description && <p className="field-description">{field.description}</p>}
              {field.options && field.options.length > 0 && (
                <p className="field-options-count">
                  {field.options.length} option{field.options.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="custom-field-controls">
            <button type="button" onClick={() => setIsEditing(true)} title="Edit">
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(field.id)}
              title="Delete"
              className="danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function CustomFieldEditor({ fields, onChange }: CustomFieldEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newField, setNewField] = useState<CustomFieldDefinition>({
    id: "",
    label: "",
    type: "text",
    description: "",
    required: false,
  });

  const handleAdd = () => {
    if (!newField.id.trim() || !newField.label.trim()) {
      alert("ID and Label are required");
      return;
    }

    if (fields.some((f) => f.id === newField.id)) {
      alert("Field ID must be unique");
      return;
    }

    onChange([...fields, newField]);
    setNewField({
      id: "",
      label: "",
      type: "text",
      description: "",
      required: false,
    });
    setShowAddForm(false);
  };

  const handleUpdate = (updatedField: CustomFieldDefinition) => {
    onChange(fields.map((f) => (f.id === updatedField.id ? updatedField : f)));
  };

  const handleDelete = (fieldId: string) => {
    if (confirm(`Delete custom field "${fields.find((f) => f.id === fieldId)?.label}"?`)) {
      onChange(fields.filter((f) => f.id !== fieldId));
    }
  };

  return (
    <div className="custom-field-editor">
      <div className="custom-field-list">
        {fields.map((field) => (
          <FieldItem
            key={field.id}
            field={field}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {showAddForm ? (
        <div className="custom-field-add-form">
          <h4>New Custom Field</h4>
          <label>
            <span>Label:</span>
            <input
              type="text"
              value={newField.label}
              onChange={(e) => setNewField({ ...newField, label: e.target.value })}
              placeholder="Hit Points"
            />
          </label>
          <label>
            <span>ID:</span>
            <input
              type="text"
              value={newField.id}
              onChange={(e) => setNewField({ ...newField, id: e.target.value })}
              placeholder="hp"
              pattern="[a-z0-9-_]+"
            />
          </label>
          <label>
            <span>Type:</span>
            <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value as CustomFieldType })}>
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="custom-field-add-actions">
            <button type="button" onClick={handleAdd}>
              Add Field
            </button>
            <button type="button" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="custom-field-add-button"
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={14} />
          Add Custom Field
        </button>
      )}
    </div>
  );
}
