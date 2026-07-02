import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { VisiblePropertyDefinition } from "../../utils/propertiesConfig";
import { PickerPopover, type PickerItem } from "./PickerPopover";
import { propertyTypeIcon, PROPERTY_TYPE_LABELS } from "./propertyTypeIcons";
import type { CustomFieldType } from "../../editorTypes";

export type AddPropertyRowProps = {
  /** Schema properties that are not present in the note yet. */
  availableProperties: VisiblePropertyDefinition[];
  onAddExisting: (propertyId: string) => void;
  onCreate: (name: string) => void;
};

/**
 * Obsidian-style "+ Add property" row: opens a fuzzy picker over the schema
 * properties missing from the note, with a create action for new names.
 */
export function AddPropertyRow({
  availableProperties,
  onAddExisting,
  onCreate,
}: AddPropertyRowProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const items: PickerItem[] = availableProperties.map((property) => {
    const TypeIcon = propertyTypeIcon(property.type);
    return {
      id: property.id,
      label: property.label || property.id,
      sublabel: PROPERTY_TYPE_LABELS[property.type as CustomFieldType] ?? property.type,
      icon: <TypeIcon size={13} />,
      keywords: [property.id, property.description ?? ""],
    };
  });

  return (
    <div className="add-property-row">
      <button
        ref={anchorRef}
        type="button"
        className="add-property-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Plus size={13} />
        Add property
      </button>
      <PickerPopover
        open={open}
        anchorRef={anchorRef}
        items={items}
        placeholder="Property name…"
        emptyLabel="No properties in schema"
        onSelect={(item) => onAddExisting(item.id)}
        onCreate={(query) => onCreate(query)}
        createLabel={(query) => `Create property "${query}"`}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
