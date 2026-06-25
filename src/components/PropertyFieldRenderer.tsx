import type { BasePropertyDefinition, CustomFieldDefinition } from "../editorTypes";

export type PropertyFieldRendererProps = {
  property: BasePropertyDefinition | CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  entityType?: string;
  availableOptions?: Array<{ value: string; label: string; color?: string }>;
};

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
      return <div className="text-xs text-gray-500">Unsupported type: {property.type}</div>;
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
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
    <div className="flex items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly}
        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
      />
      <label className="ml-2 text-sm text-gray-700">{property.description}</label>
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
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
    <div className="space-y-1">
      {options.map((opt) => {
        const isSelected = selectedValues.includes(opt.value);
        return (
          <div key={opt.value} className="flex items-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggle(opt.value)}
              disabled={readOnly}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
            />
            <label className="ml-2 text-sm text-gray-700">
              {opt.color && (
                <span
                  className="inline-block w-3 h-3 mr-1 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
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
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
      onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      readOnly={readOnly}
      placeholder={`References to ${property.targetTypes?.join(", ") || "entities"} (comma-separated)`}
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
    <div className="flex items-center gap-2">
      <input
        type="url"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "https://example.com"}
        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={readOnly}
      />
      {stringValue && (
        <a
          href={stringValue}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800"
          title="Open link"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
    <div className="flex items-center gap-2">
      <input
        type="email"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "email@example.com"}
        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={readOnly}
      />
      {stringValue && (
        <a
          href={`mailto:${stringValue}`}
          className="text-blue-600 hover:text-blue-800"
          title="Send email"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
    <div className="flex items-center gap-2">
      <input
        type="tel"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={property.description || "+1 234 567 8900"}
        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={readOnly}
      />
      {stringValue && (
        <a
          href={`tel:${stringValue}`}
          className="text-blue-600 hover:text-blue-800"
          title="Call number"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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
    <div className="space-y-2">
      <input
        type="text"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Path to file in vault"
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={readOnly}
      />
      {stringValue && (
        <div className="text-xs text-gray-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
    <div className="space-y-2">
      <input
        type="text"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Path to image in vault"
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={readOnly}
      />
      {stringValue && (
        <div className="border border-gray-300 rounded p-2">
          <img
            src={stringValue}
            alt="Preview"
            className="max-w-full h-auto max-h-48 rounded"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
