import type { BasePropertyDefinition, CustomFieldDefinition } from "../editorTypes";
import type { VaultIndex } from "../domain";

export type PropertyFieldRendererProps = {
  property: BasePropertyDefinition | CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  entityType?: string;
  availableOptions?: Array<{ value: string; label: string; color?: string }>;
  /** Enables entity/file/image pickers; without it those types degrade to text inputs. */
  vaultIndex?: VaultIndex;
  onOpenEntity?: (path: string) => void;
};

const FIELD_CONTROL_CLASS = "property-field-control";
const FIELD_INLINE_CLASS = "property-field-inline";
const FIELD_CHECKBOX_ROW_CLASS = "property-field-checkbox-row";
const FIELD_CHECKBOX_CLASS = "property-field-checkbox";
const FIELD_HELPER_CLASS = "property-field-helper";
const FIELD_LINK_CLASS = "property-field-link";
const FIELD_MULTISELECT_CLASS = "property-field-multiselect";
const FIELD_SWATCH_CLASS = "property-field-swatch";
const FIELD_PREVIEW_CLASS = "property-field-preview";
const FIELD_PREVIEW_IMAGE_CLASS = "property-field-preview-image";
const FIELD_UNSUPPORTED_CLASS = "property-field-unsupported";

/**
 * Universal field renderer for all property types (base + custom)
 * Handles rendering and editing of properties based on their type configuration
 */
export function PropertyFieldRenderer({
  property,
  value,
  onChange,
  readOnly = false,
  availableOptions,
}: PropertyFieldRendererProps): React.JSX.Element {
  const isReadOnly = readOnly || ("readOnly" in property && property.readOnly) || false;
  const isRequired = property.required ?? false;

  // Render based on property type
  switch (property.type) {
    case "text":
      return renderTextInput(property, value, onChange, isReadOnly, isRequired);

    case "number":
      return renderNumberInput(property, value, onChange, isReadOnly, isRequired);

    case "boolean":
      return renderCheckbox(property, value, onChange, isReadOnly);

    case "date":
      return renderDateInput(property, value, onChange, isReadOnly, isRequired);

    case "select":
      return renderSelect(property, value, onChange, isReadOnly, isRequired, availableOptions);

    case "multiselect":
      return renderMultiselect(property, value, onChange, isReadOnly, availableOptions);

    case "entity-ref":
      return renderEntityRef(property, value, onChange, isReadOnly, isRequired);

    case "entity-ref-list":
      return renderEntityRefList(property, value, onChange, isReadOnly);

    case "url":
      return renderUrlInput(property, value, onChange, isReadOnly, isRequired);

    case "email":
      return renderEmailInput(property, value, onChange, isReadOnly, isRequired);

    case "phone":
      return renderPhoneInput(property, value, onChange, isReadOnly, isRequired);

    case "file":
      return renderFileInput(property, value, onChange, isReadOnly);

    case "image":
      return renderImageInput(property, value, onChange, isReadOnly);

    default:
      return <div className={FIELD_UNSUPPORTED_CLASS}>Unsupported type: {property.type}</div>;
  }
}

// ============================================================================
// Individual field renderers
// ============================================================================

function renderTextInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  return (
    <input
      type="text"
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      required={required}
      pattern={property.pattern}
      placeholder={property.description}
      className={FIELD_CONTROL_CLASS}
      disabled={readOnly}
    />
  );
}

function renderNumberInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const numValue = typeof value === "number" ? value : undefined;

  return (
    <input
      type="number"
      value={numValue ?? ""}
      onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
      readOnly={readOnly}
      required={required}
      min={property.min}
      max={property.max}
      placeholder={property.description}
      className={FIELD_CONTROL_CLASS}
      disabled={readOnly}
    />
  );
}

function renderCheckbox(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
): React.JSX.Element {
  const checked = value === true;

  return (
    <div className={FIELD_CHECKBOX_ROW_CLASS}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly}
        className={FIELD_CHECKBOX_CLASS}
      />
      <label>{property.description}</label>
    </div>
  );
}

function renderDateInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const dateValue = typeof value === "string" ? value : "";

  return (
    <input
      type="date"
      value={dateValue}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      required={required}
      placeholder={property.description}
      className={FIELD_CONTROL_CLASS}
      disabled={readOnly}
    />
  );
}

function renderSelect(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
  availableOptions?: Array<{ value: string; label: string; color?: string }>,
): React.JSX.Element {
  const options = availableOptions || property.options || [];
  const stringValue = typeof value === "string" ? value : "";

  return (
    <select
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      required={required}
      className={FIELD_CONTROL_CLASS}
    >
      {!required && <option value="">None</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function renderMultiselect(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  availableOptions?: Array<{ value: string; label: string; color?: string }>,
): React.JSX.Element {
  const options = availableOptions || property.options || [];
  const selectedValues = Array.isArray(value) ? value : [];

  const handleToggle = (optionValue: string) => {
    if (readOnly) return;

    const newValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((v) => v !== optionValue)
      : [...selectedValues, optionValue];

    onChange(newValues);
  };

  return (
    <div className={FIELD_MULTISELECT_CLASS}>
      {options.map((opt) => {
        const isSelected = selectedValues.includes(opt.value);
        return (
          <div key={opt.value} className={FIELD_CHECKBOX_ROW_CLASS}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggle(opt.value)}
              disabled={readOnly}
              className={FIELD_CHECKBOX_CLASS}
            />
            <label>
              {opt.color && (
                <span className={FIELD_SWATCH_CLASS} style={{ backgroundColor: opt.color }} />
              )}
              {opt.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}

function renderEntityRef(
  _property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const property = _property as BasePropertyDefinition | CustomFieldDefinition;
  const stringValue = typeof value === "string" ? value : "";

  // TODO: Implement entity picker with autocomplete
  return (
    <input
      type="text"
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      required={required}
      placeholder={`Reference to ${property.targetTypes?.join(", ") || "entity"}`}
      className={FIELD_CONTROL_CLASS}
      disabled={readOnly}
    />
  );
}

function renderEntityRefList(
  _property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
): React.JSX.Element {
  const property = _property as BasePropertyDefinition | CustomFieldDefinition;
  const arrayValue = Array.isArray(value) ? value.join(", ") : "";

  // TODO: Implement multi-entity picker
  return (
    <input
      type="text"
      value={arrayValue}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
      readOnly={readOnly}
      placeholder={`References to ${property.targetTypes?.join(", ") || "entities"} (comma-separated)`}
      className={FIELD_CONTROL_CLASS}
      disabled={readOnly}
    />
  );
}

function renderUrlInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  return (
    <div className={FIELD_INLINE_CLASS}>
      <input
        type="url"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "https://example.com"}
        className={FIELD_CONTROL_CLASS}
        disabled={readOnly}
      />
      {stringValue && (
        <a
          href={stringValue}
          target="_blank"
          rel="noopener noreferrer"
          className={FIELD_LINK_CLASS}
          title="Open link"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

function renderEmailInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  return (
    <div className={FIELD_INLINE_CLASS}>
      <input
        type="email"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "email@example.com"}
        className={FIELD_CONTROL_CLASS}
        disabled={readOnly}
      />
      {stringValue && (
        <a href={`mailto:${stringValue}`} className={FIELD_LINK_CLASS} title="Send email">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

function renderPhoneInput(
  property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
  required: boolean,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  return (
    <div className={FIELD_INLINE_CLASS}>
      <input
        type="tel"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "+1 234 567 8900"}
        className={FIELD_CONTROL_CLASS}
        disabled={readOnly}
      />
      {stringValue && (
        <a href={`tel:${stringValue}`} className={FIELD_LINK_CLASS} title="Call number">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

function renderFileInput(
  _property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  // TODO: Implement file picker with vault file browser
  return (
    <div className={FIELD_MULTISELECT_CLASS}>
      <input
        type="text"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Path to file in vault"
        className={FIELD_CONTROL_CLASS}
        disabled={readOnly}
      />
      {stringValue && (
        <div className={FIELD_HELPER_CLASS}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span>{stringValue}</span>
        </div>
      )}
    </div>
  );
}

function renderImageInput(
  _property: BasePropertyDefinition | CustomFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean | undefined,
): React.JSX.Element {
  const stringValue = typeof value === "string" ? value : "";

  // TODO: Implement image picker with preview
  return (
    <div className={FIELD_MULTISELECT_CLASS}>
      <input
        type="text"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Path to image in vault"
        className={FIELD_CONTROL_CLASS}
        disabled={readOnly}
      />
      {stringValue && (
        <div className={FIELD_PREVIEW_CLASS}>
          <img
            src={stringValue}
            alt="Preview"
            className={FIELD_PREVIEW_IMAGE_CLASS}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
