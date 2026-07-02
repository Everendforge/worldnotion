import { useState } from "react";
import {
  ChevronRight,
  EyeOff,
  Pencil,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import type { CustomFieldType } from "../../editorTypes";
import type { VisiblePropertyDefinition } from "../../utils/propertiesConfig";
import { PROPERTY_TYPE_ICONS, PROPERTY_TYPE_LABELS } from "./propertyTypeIcons";

const CHANGEABLE_TYPES = Object.keys(PROPERTY_TYPE_LABELS).filter(
  (type) => type !== "group",
) as CustomFieldType[];

export type PropertyContextMenuProps = {
  position: { x: number; y: number };
  /** Property under the cursor; undefined for the panel-background menu. */
  property?: VisiblePropertyDefinition;
  allProperties: VisiblePropertyDefinition[];
  visiblePropertyIds: Set<string>;
  showHiddenProperties: boolean;
  /** Core spec fields (id/type/name/status…) cannot be renamed or removed. */
  isProtected: (propertyId: string) => boolean;
  canEditOptions: (property: VisiblePropertyDefinition) => boolean;
  onOpenPropertyManager: (propertyId?: string) => void;
  onEditOptions: (property: VisiblePropertyDefinition) => void;
  onAddCondition: (propertyId: string) => void;
  onHide: (propertyId: string) => void;
  onRemoveFromNote: (propertyId: string) => void;
  onDeleteFromUniverse: (propertyId: string) => void;
  onRename: (propertyId: string, newName: string) => void;
  onChangeType: (propertyId: string, newType: CustomFieldType) => void;
  onToggleVisibility: (propertyId: string) => void;
  onToggleShowHidden: () => void;
  onClose: () => void;
};

/**
 * Right-click menu for a property row (or the panel background), including
 * rename-inline and a change-type submenu.
 */
export function PropertyContextMenu({
  position,
  property,
  allProperties,
  visiblePropertyIds,
  showHiddenProperties,
  isProtected,
  canEditOptions,
  onOpenPropertyManager,
  onEditOptions,
  onAddCondition,
  onHide,
  onRemoveFromNote,
  onDeleteFromUniverse,
  onRename,
  onChangeType,
  onToggleVisibility,
  onToggleShowHidden,
  onClose,
}: PropertyContextMenuProps) {
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [typeSubmenuOpen, setTypeSubmenuOpen] = useState(false);

  const protectedProperty = property ? isProtected(property.id) : false;

  const submitRename = () => {
    if (!property || renameDraft === null) return;
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== (property.label || property.id)) {
      onRename(property.id, trimmed);
    }
    onClose();
  };

  const visibilityToggles = allProperties.map((candidate) => {
    const visible = visiblePropertyIds.has(candidate.id);
    return (
      <button
        key={candidate.id}
        type="button"
        className="context-menu-item"
        onClick={() => {
          onToggleVisibility(candidate.id);
          onClose();
        }}
      >
        <span className="context-menu-check">{visible ? "✓" : ""}</span>
        <span>{candidate.label || candidate.id}</span>
      </button>
    );
  });

  return (
    <div
      className="context-menu inspector-property-context-menu"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      role="menu"
    >
      {property ? (
        <>
          {renameDraft !== null ? (
            <div className="context-menu-rename">
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitRename();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setRenameDraft(null);
                  }
                }}
                onBlur={submitRename}
                aria-label="New property name"
              />
            </div>
          ) : (
            <button
              type="button"
              className="context-menu-item"
              disabled={protectedProperty}
              title={protectedProperty ? "Core fields cannot be renamed" : undefined}
              onClick={() => setRenameDraft(property.label || property.id)}
            >
              <Pencil size={16} />
              <span>Rename</span>
            </button>
          )}

          <div
            className="context-menu-submenu-anchor"
            onPointerEnter={() => setTypeSubmenuOpen(true)}
            onPointerLeave={() => setTypeSubmenuOpen(false)}
          >
            <button
              type="button"
              className="context-menu-item"
              disabled={protectedProperty || property.type === "group"}
              title={protectedProperty ? "Core fields cannot change type" : undefined}
              onClick={() => setTypeSubmenuOpen((current) => !current)}
              aria-expanded={typeSubmenuOpen}
            >
              <Type size={16} />
              <span>Change type</span>
              <ChevronRight size={13} className="context-menu-submenu-chevron" />
            </button>
            {typeSubmenuOpen && !protectedProperty && property.type !== "group" ? (
              <div className="context-menu context-menu-submenu" role="menu">
                {CHANGEABLE_TYPES.map((type) => {
                  const TypeIcon = PROPERTY_TYPE_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      className="context-menu-item"
                      onClick={() => {
                        onChangeType(property.id, type);
                        onClose();
                      }}
                    >
                      <TypeIcon size={15} />
                      <span>{PROPERTY_TYPE_LABELS[type]}</span>
                      <span className="context-menu-check">
                        {property.type === type ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {canEditOptions(property) ? (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onEditOptions(property);
                onClose();
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Edit options</span>
            </button>
          ) : null}

          <button
            type="button"
            className="context-menu-item"
            onClick={() => onOpenPropertyManager(property.id)}
          >
            <Settings2 size={16} />
            <span>Customize properties</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onAddCondition(property.id);
            }}
          >
            <SlidersHorizontal size={16} />
            <span>Add unlock condition</span>
          </button>
          <button type="button" className="context-menu-item" onClick={() => onHide(property.id)}>
            <EyeOff size={16} />
            <span>Hide</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            disabled={protectedProperty}
            onClick={() => onRemoveFromNote(property.id)}
          >
            <Trash2 size={16} />
            <span>Remove from this note</span>
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item danger"
            disabled={protectedProperty}
            onClick={() => onDeleteFromUniverse(property.id)}
          >
            <Trash2 size={16} />
            <span>Delete from universe</span>
          </button>
          <div className="context-menu-separator" />
          {visibilityToggles}
        </>
      ) : (
        <>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => onOpenPropertyManager()}
          >
            <Settings2 size={16} />
            <span>Customize properties</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onToggleShowHidden();
              onClose();
            }}
          >
            <EyeOff size={16} />
            <span>
              {showHiddenProperties ? "Hide hidden properties" : "Show hidden properties"}
            </span>
          </button>
          <div className="context-menu-separator" />
          {visibilityToggles}
        </>
      )}
    </div>
  );
}
