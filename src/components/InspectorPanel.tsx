import { lazy, Suspense } from "react";
import type { Entity, EntityTemplate, VaultIndex } from "../domain";
import type { CustomFieldDefinition, OpenTab, PropertiesConfig } from "../editorTypes";
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
  onAddPropertyToUniverse?: (property: CustomFieldDefinition) => void | Promise<void>;
  onUpdatePropertiesConfig?: (properties: PropertiesConfig) => void | Promise<void>;
  onOpenPropertiesSettings?: () => void;
};

export function InspectorPanel({
  entity,
  template,
  index,
  activeTab,
  onChangeFrontmatter,
  onUpdateEntity,
  onAddFrontmatter,
  onAddPropertyToUniverse,
  onUpdatePropertiesConfig,
  onOpenPropertiesSettings,
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
                Add Frontmatter
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

  const propertiesConfig = index.propertiesConfig ?? index.taxonomyConfig;
  const editableFrontmatter = activeTab?.path === entity.path ? rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw : "";
  const hasFrontmatter = editableFrontmatter.trim().length > 0;

  return (
    <aside className="inspector">
      <section>
        {activeTab?.path === entity.path && onChangeFrontmatter && onUpdateEntity ? (
          <>
            {!hasFrontmatter && onAddFrontmatter ? (
              <div className="no-frontmatter-notice">
                <p className="muted">This note has no frontmatter.</p>
                <button className="btn btn-primary" onClick={onAddFrontmatter}>
                  Add Frontmatter
                </button>
              </div>
            ) : (
              <>
                <Suspense fallback={<LazyPanelFallback label="Loading metadata..." />}>
                  <MetadataEditor
                    entity={entity}
                    taxonomyConfig={propertiesConfig}
                    rawYaml={editableFrontmatter || "---\n\n---"}
                    onUpdate={(updates) => onUpdateEntity(updates)}
                    onUpdateRawYaml={(yaml) => onChangeFrontmatter(yaml)}
                    onAddPropertyToUniverse={onAddPropertyToUniverse}
                    onUpdatePropertiesConfig={onUpdatePropertiesConfig}
                    onOpenPropertiesSettings={onOpenPropertiesSettings}
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
