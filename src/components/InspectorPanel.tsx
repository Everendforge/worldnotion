import { lazy, Suspense } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import type { Entity, EntityTemplate, VaultIndex } from "../domain";
import type { OpenTab, PropertiesConfig } from "../editorTypes";
import { rawToEditorParts } from "../utils/contentTemplates";
import { LazyPanelFallback } from "./LazyPanelFallback";

const MetadataEditor = lazy(() =>
  import("./MetadataEditor").then((module) => ({ default: module.MetadataEditor })),
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
  onApplyPropertiesTemplate?: () => void | Promise<void>;
  onOpenPropertiesSettings?: () => void;
  onConserveField?: (fieldName: string, value: unknown) => void | Promise<void>;
  onDeleteField?: (fieldName: string) => void;
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
  onApplyPropertiesTemplate,
  onOpenPropertiesSettings,
  onConserveField,
  onDeleteField,
}: InspectorPanelProps) {
  if (!index) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">Open a universe to inspect metadata.</p>
      </aside>
    );
  }

  if (template) {
    return (
      <aside className="inspector">
        <h2>Template</h2>
        <p className="path-line">{template.path}</p>
        <p className="muted">Templates are Markdown files with placeholders.</p>
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
            <div className="no-frontmatter-notice">
              <p className="muted">This note has no frontmatter.</p>
              <button className="btn btn-primary" onClick={onAddFrontmatter}>
                Add WorldNotion frontmatter
              </button>
            </div>
          </section>
        </aside>
      );
    }
  }

  if (!entity) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">Select a note or template.</p>
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
              <h3>Set up properties</h3>
              <p>
                This universe does not have `.everend/properties.json` yet. Apply a starter template
                here, then shape properties directly from the inspector.
              </p>
            </div>
            <div className="inspector-setup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onApplyPropertiesTemplate?.()}
              >
                <Sparkles size={14} />
                Apply template
              </button>
              <button type="button" className="btn" onClick={onOpenPropertiesSettings}>
                <SlidersHorizontal size={14} />
                Open utils
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
              <div className="no-frontmatter-notice">
                <p className="muted">This note has no frontmatter.</p>
                <button className="btn btn-primary" onClick={onAddFrontmatter}>
                  Add WorldNotion frontmatter
                </button>
              </div>
            ) : (
              <>
                <Suspense fallback={<LazyPanelFallback label="Loading metadata..." />}>
                  <MetadataEditor
                    entity={entity}
                    propertiesConfig={propertiesConfig}
                    rawYaml={editableFrontmatter || "---\n\n---"}
                    vaultIndex={index}
                    onUpdate={(updates) => onUpdateEntity(updates)}
                    onUpdateRawYaml={(yaml) => onChangeFrontmatter(yaml)}
                    onUpdatePropertiesConfig={onUpdatePropertiesConfig}
                    onConserveField={onConserveField}
                    onDeleteField={onDeleteField}
                    onOpenEntity={onOpenEntity}
                  />
                </Suspense>
              </>
            )}
          </>
        ) : (
          <>
            <p className="muted">Open this note in a tab to edit its metadata.</p>
          </>
        )}
      </section>
    </aside>
  );
}
