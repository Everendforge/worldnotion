import type { Entity } from "../../domain";
import type { PropertiesConfig } from "../../editorTypes";

type LegacyMetadataFieldsProps = {
  entity: Entity;
  propertiesConfig?: PropertiesConfig;
  onUpdate: (updates: Partial<Entity>) => void;
};

/**
 * Backward-compatible metadata form used when the vault config has no
 * baseProperties (pre-v2.0 schemas). Kept intact so legacy vaults keep
 * working; new vaults use the Obsidian-style properties panel instead.
 */
export function LegacyMetadataFields({
  entity,
  propertiesConfig,
  onUpdate,
}: LegacyMetadataFieldsProps) {
  const entityTypes = propertiesConfig?.entityTypes.definitions ?? [];
  const statuses = propertiesConfig?.statuses.definitions ?? [];
  const customFieldDefs = propertiesConfig?.customFields.definitions ?? [];
  const entityTypeDef = entityTypes.find((t) => t.id === entity.type);

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

  const renderCustomField = (fieldDef: (typeof customFieldDefs)[0]) => {
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
              <select value={entity.type} onChange={(e) => onUpdate({ type: e.target.value })}>
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
              <select value={entity.status} onChange={(e) => onUpdate({ status: e.target.value })}>
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
