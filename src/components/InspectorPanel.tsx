import { lazy, Suspense, useState } from "react";
import { PanelsTopLeft, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Entity, EntityTemplate, VaultIndex } from "../domain";
import type { OpenTab, PropertiesConfig } from "../editorTypes";
import { rawToEditorParts } from "../utils/contentTemplates";
import { LazyPanelFallback } from "./LazyPanelFallback";
import { InspectorOnboarding } from "./properties/InspectorOnboarding";
import { VariantSelector } from "./VariantSelector";
import { useWorldnotionUi } from "../i18n";

function noteFileName(path: string) {
  return path.split("/").pop()?.replace(/\.md$/i, "") || "untitled";
}

const MetadataEditor = lazy(() =>
  import("./MetadataEditor").then((module) => ({ default: module.MetadataEditor })),
);
const PresentationEditor = lazy(() =>
  import("./PresentationEditor").then((module) => ({ default: module.PresentationEditor })),
);
export type InspectorPanelProps = {
  entity?: Entity;
  template?: EntityTemplate;
  index?: VaultIndex;
  activeTab?: OpenTab;
  onChangeFrontmatter?: (frontmatterRaw: string) => void;
  onUpdateEntity?: (updates: Partial<Entity>) => void;
  onOpenEntity?: (path: string) => void;
  onAddFrontmatter?: () => void;
  onUpdatePropertiesConfig?: (properties: PropertiesConfig) => void | Promise<void>;
  onRequestPropertyPathChange?: (properties: PropertiesConfig) => void | Promise<void>;
  onApplyPropertiesTemplate?: () => void | Promise<void>;
  onOpenPropertiesSettings?: () => void;
  onConserveField?: (fieldName: string, value: unknown) => void | Promise<void>;
  onDeleteField?: (fieldName: string) => void;
  onRequestImage?: () => Promise<{ path: string; alt?: string } | null>;
  activeVariantId?: string;
  onSelectVariant?: (id: string) => void;
  onInsertVariantBlock?: () => void;
  onDeleteVariant?: (id: string) => void;
  explorerSelection?: Array<{ path: string; kind: "file" | "folder" }>;
  onMoveExplorerSelection?: (targetFolderPath: string) => void | Promise<void>;
};

export function InspectorPanel({
  entity,
  template,
  index,
  activeTab,
  onChangeFrontmatter,
  onUpdateEntity,
  onOpenEntity,
  onAddFrontmatter,
  onUpdatePropertiesConfig,
  onRequestPropertyPathChange,
  onApplyPropertiesTemplate,
  onOpenPropertiesSettings,
  onConserveField,
  onDeleteField,
  onRequestImage,
  activeVariantId = "base",
  onSelectVariant,
  onInsertVariantBlock,
  onDeleteVariant,
  explorerSelection = [],
  onMoveExplorerSelection,
}: InspectorPanelProps) {
  const ui = useWorldnotionUi();
  const [activeView, setActiveView] = useState<"properties" | "presentation">("properties");
  const [moveTarget, setMoveTarget] = useState("");
  if (!index) {
    return (
      <aside className="inspector">
        <h2>{ui.inspector}</h2>
        <p className="muted">{ui.openUniverseToInspect}</p>
      </aside>
    );
  }

  if (explorerSelection.length > 1) {
    return (
      <aside className="inspector">
        <h2>{ui.bulkSelection}</h2>
        <p className="muted">
          {ui.itemsSelected.replace("{{count}}", String(explorerSelection.length))}
        </p>
        <label className="field-label">
          {ui.moveToFolderPath}
          <input
            value={moveTarget}
            onChange={(event) => setMoveTarget(event.target.value)}
            placeholder={ui.root}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void onMoveExplorerSelection?.(moveTarget)}
        >
          {ui.moveItems.replace("{{count}}", String(explorerSelection.length))}
        </button>
      </aside>
    );
  }

  if (template) {
    return (
      <aside className="inspector">
        <h2>{ui.template}</h2>
        <p className="path-line">{template.path}</p>
        <p className="muted">{ui.templateDescription}</p>
      </aside>
    );
  }

  // Check if we have an active tab without a corresponding entity (e.g., note without frontmatter)
  if (!entity && activeTab) {
    const tabFrontmatter = rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw;
    const tabHasFrontmatter = tabFrontmatter.trim().length > 0;

    if (!tabHasFrontmatter && onAddFrontmatter && onChangeFrontmatter) {
      return (
        <aside className="inspector">
          <section>
            {index.propertiesConfig ? (
              <InspectorOnboarding
                fileName={noteFileName(activeTab.path)}
                propertiesConfig={index.propertiesConfig}
                onInitialize={onChangeFrontmatter}
              />
            ) : (
              <div className="no-frontmatter-notice">
                <p className="muted">{ui.noFrontmatter}</p>
                <button className="btn btn-primary" onClick={onAddFrontmatter}>
                  {ui.addFrontmatter}
                </button>
              </div>
            )}
          </section>
        </aside>
      );
    }
  }

  if (!entity) {
    return (
      <aside className="inspector">
        <h2>{ui.inspector}</h2>
        <p className="muted">{ui.selectNoteOrTemplate}</p>
      </aside>
    );
  }

  const propertiesConfig = index.propertiesConfig;
  const editableFrontmatter =
    activeTab?.path === entity.path ? rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw : "";
  const hasFrontmatter = editableFrontmatter.trim().length > 0;

  if (!propertiesConfig) {
    return (
      <aside className="inspector">
        <section>
          <div className="inspector-setup-card">
            <div className="inspector-setup-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <h3>{ui.setupProperties}</h3>
              <p>
                {ui.propertiesSetupDescription}
              </p>
            </div>
            <div className="inspector-setup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onApplyPropertiesTemplate?.()}
              >
                <Sparkles size={14} />
                {ui.applyTemplate}
              </button>
              <button type="button" className="btn" onClick={onOpenPropertiesSettings}>
                <SlidersHorizontal size={14} />
                {ui.openTools}
              </button>
            </div>
          </div>
        </section>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <section>
        {activeTab?.path === entity.path && onChangeFrontmatter && onUpdateEntity ? (
          <>
            {!hasFrontmatter && onAddFrontmatter ? (
              propertiesConfig ? (
                <InspectorOnboarding
                  fileName={noteFileName(entity.path)}
                  propertiesConfig={propertiesConfig}
                  onInitialize={onChangeFrontmatter}
                />
              ) : (
                <div className="no-frontmatter-notice">
                  <p className="muted">{ui.noFrontmatter}</p>
                  <button className="btn btn-primary" onClick={onAddFrontmatter}>
                    {ui.addFrontmatter}
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="variant-selector-shell">
                  <VariantSelector
                    rawYaml={editableFrontmatter || "---\n\n---"}
                    config={propertiesConfig}
                    type={entity.type}
                    activeVariantId={activeVariantId}
                    onSelect={(id) => onSelectVariant?.(id)}
                    onUpdateRawYaml={(yaml) => onChangeFrontmatter(yaml)}
                    onInsertBlock={onInsertVariantBlock}
                    onDeleteVariant={onDeleteVariant}
                  />
                </div>
                <div className="inspector-subviews" role="tablist" aria-label={ui.noteInspector}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === "properties"}
                    className={activeView === "properties" ? "active" : ""}
                    onClick={() => setActiveView("properties")}
                  >
                    {ui.properties}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === "presentation"}
                    className={activeView === "presentation" ? "active" : ""}
                    onClick={() => setActiveView("presentation")}
                  >
                    <PanelsTopLeft size={13} aria-hidden="true" />
                    {ui.presentation}
                  </button>
                </div>
                <Suspense fallback={<LazyPanelFallback label={ui.loadingInspector} />}>
                  {activeView === "properties" ? (
                    <MetadataEditor
                      entity={entity}
                      propertiesConfig={propertiesConfig}
                      rawYaml={editableFrontmatter || "---\n\n---"}
                      vaultIndex={index}
                      onUpdate={(updates) => onUpdateEntity(updates)}
                      onUpdateRawYaml={(yaml) => onChangeFrontmatter(yaml)}
                      onUpdatePropertiesConfig={onUpdatePropertiesConfig}
                      onRequestPropertyPathChange={onRequestPropertyPathChange}
                      onConserveField={onConserveField}
                      onDeleteField={onDeleteField}
                      onOpenEntity={onOpenEntity}
                      onRequestImage={onRequestImage}
                      activeVariantId={activeVariantId}
                    />
                  ) : (
                    <PresentationEditor
                      entity={entity}
                      config={propertiesConfig}
                      rawYaml={editableFrontmatter || "---\n\n---"}
                      vaultIndex={index}
                      onUpdateRawYaml={onChangeFrontmatter}
                      onUpdatePropertiesConfig={onUpdatePropertiesConfig}
                      onRequestImage={onRequestImage}
                      activeVariantId={activeVariantId}
                    />
                  )}
                </Suspense>
              </>
            )}
          </>
        ) : (
          <>
            <p className="muted">{ui.openNoteToEditMetadata}</p>
          </>
        )}
      </section>
    </aside>
  );
}
