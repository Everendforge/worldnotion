import { useMemo } from "react";
import { ImagePlus, PanelTop, UserRound } from "lucide-react";
import type { Entity, VaultIndex } from "../domain";
import type { PropertiesConfig } from "../editorTypes";
import { updateFrontmatterProperties } from "../utils/propertiesConfig";
import {
  getEntityTypeDefinition,
  getPresentationRolePropertyId,
  getPresentationRoleValue,
  listPresentationImageProperties,
  updateEntityTypePresentation,
  type PresentationRole,
} from "../utils/entityPresentation";
import { parseFrontmatterRaw } from "../utils/propertiesConfig";
import { ImageField } from "./properties/fields/ImageField";
import { useWorldnotionUi } from "../i18n";
import {
  BASE_VARIANT_ID,
  resolveVariantFrontmatter,
  setVariantOverride,
  updateVariantsInRawYaml,
} from "../utils/noteVariants";

type PresentationEditorProps = {
  entity: Entity;
  config: PropertiesConfig;
  rawYaml: string;
  vaultIndex: VaultIndex;
  onUpdateRawYaml: (yaml: string) => void;
  onUpdatePropertiesConfig?: (config: PropertiesConfig) => void | Promise<void>;
  onRequestImage?: () => Promise<{ path: string; alt?: string } | null>;
  activeVariantId?: string;
};

const ROLE_ICONS: Record<PresentationRole, { Icon: typeof UserRound }> = {
  portrait: {
    Icon: UserRound,
  },
  cover: {
    Icon: PanelTop,
  },
};

export function PresentationEditor({
  entity,
  config,
  rawYaml,
  vaultIndex,
  onUpdateRawYaml,
  onUpdatePropertiesConfig,
  onRequestImage,
  activeVariantId = BASE_VARIANT_ID,
}: PresentationEditorProps) {
  const ui = useWorldnotionUi();
  const type = getEntityTypeDefinition(config, entity.type);
  const imageProperties = useMemo(
    () => listPresentationImageProperties(config, entity.type),
    [config, entity.type],
  );
  const rawFrontmatter = useMemo(() => parseFrontmatterRaw(rawYaml), [rawYaml]);
  const frontmatter = useMemo(
    () => resolveVariantFrontmatter(rawFrontmatter, activeVariantId),
    [activeVariantId, rawFrontmatter],
  );

  if (!type) {
    return (
      <div className="presentation-empty-state">
        <PanelTop size={20} aria-hidden="true" />
        <strong>{ui.presentationUnavailable}</strong>
        <p>
          {ui.customTypeUnavailable.replace("{{type}}", entity.type)}
        </p>
      </div>
    );
  }

  const setRoleProperty = (role: PresentationRole, propertyId: string) => {
    const next = updateEntityTypePresentation(config, type.id, role, propertyId || undefined);
    void onUpdatePropertiesConfig?.(next);
  };

  const setRoleValue = (role: PresentationRole, value: unknown) => {
    const propertyId = getPresentationRolePropertyId(config, type.id, role);
    if (!propertyId) return;
    if (activeVariantId !== BASE_VARIANT_ID) {
      onUpdateRawYaml(
        updateVariantsInRawYaml(
          rawYaml,
          setVariantOverride(rawFrontmatter, config, activeVariantId, propertyId, value),
          config,
          type.id,
        ),
      );
      return;
    }
    onUpdateRawYaml(updateFrontmatterProperties(rawYaml, { [propertyId]: value }, config, type.id));
  };

  return (
    <div className="presentation-editor">
      <header className="presentation-editor-heading">
        <div>
          <span className="presentation-editor-eyebrow">{type.label}</span>
          <h3>{activeVariantId !== BASE_VARIANT_ID ? ui.presentationVariant : ui.presentation}</h3>
        </div>
        <p>
          {ui.presentationDescription.replace("{{type}}", type.label)}
        </p>
      </header>

      {imageProperties.length === 0 ? (
        <div className="presentation-empty-state">
          <ImagePlus size={20} aria-hidden="true" />
          <strong>{ui.enableImageProperty}</strong>
          <p>{ui.imagePropertyHint.replace("{{type}}", type.label)}</p>
        </div>
      ) : (
        (["portrait", "cover"] as PresentationRole[]).map((role) => {
          const Icon = ROLE_ICONS[role].Icon;
          const label = role === "portrait" ? ui.portrait : ui.cover;
          const description = role === "portrait" ? ui.portraitDescription : ui.coverDescription;
          const propertyId = getPresentationRolePropertyId(config, type.id, role);
          const value = getPresentationRoleValue(config, type.id, frontmatter, role) ?? "";
          return (
            <section className="presentation-role-card" key={role}>
              <div className="presentation-role-heading">
                <Icon size={16} aria-hidden="true" />
                <div>
                  <strong>{label}</strong>
                  <p>{description}</p>
                </div>
              </div>
              <label className="presentation-role-select">
                <span>{ui.imageProperty}</span>
                <select
                  value={propertyId ?? ""}
                  onChange={(event) => setRoleProperty(role, event.target.value)}
                  disabled={!onUpdatePropertiesConfig}
                >
                  <option value="">{ui.notEnabled}</option>
                  {imageProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.label ?? property.id}
                    </option>
                  ))}
                </select>
              </label>
              {propertyId ? (
                <div className="presentation-role-assignment">
                  <ImageField
                    value={value}
                    onChange={(nextValue) => setRoleValue(role, nextValue)}
                    vaultIndex={vaultIndex}
                    onRequestImage={onRequestImage}
                  />
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
