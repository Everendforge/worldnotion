import { lazy, Suspense } from "react";
import type { Entity, EntityTemplate, ValidationFinding, VaultIndex, ParsedMarkdown } from "../domain";
import { parseMarkdownFrontmatter } from "../domain";
import type { OpenTab } from "../editorTypes";
import { rawToEditorParts } from "../utils/contentTemplates";
import { LazyPanelFallback } from "./LazyPanelFallback";

const MetadataEditor = lazy(() =>
  import("./MetadataEditor").then((module) => ({ default: module.MetadataEditor })),
);
const BacklinksPanel = lazy(() =>
  import("./BacklinksPanel").then((module) => ({ default: module.BacklinksPanel })),
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
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FindingBadge({ finding }: { finding: ValidationFinding }) {
  return <span className={`finding-badge finding-${finding.severity}`}>{finding.severity}</span>;
}

export function InspectorPanel({
  entity,
  template,
  index,
  activeTab,
  onChangeFrontmatter,
  onUpdateEntity,
  onOpenEntity,
  onAddFrontmatter,
}: InspectorPanelProps) {
  if (!index) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">Open a universe to inspect metadata and links.</p>
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
          <h2>{activeTab.path.split("/").pop()}</h2>
          <p className="path-line">{activeTab.path}</p>
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

  const findings = index.findings.filter((finding) => finding.file === entity.path);
  const typeDefinition = index.taxonomy?.types[entity.type];
  const editableFrontmatter = activeTab?.path === entity.path ? rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw : "";
  const hasFrontmatter = editableFrontmatter.trim().length > 0;

  // Parse metadata in real-time from activeTab if available
  let parsedRealTimeMetadata: ParsedMarkdown | null = null;
  if (activeTab?.path === entity.path && hasFrontmatter) {
    try {
      parsedRealTimeMetadata = parseMarkdownFrontmatter(activeTab.rawMarkdown);
    } catch (e) {
      // Invalid YAML, keep null
    }
  }

  return (
    <aside className="inspector">
      <h2>{entity.name}</h2>
      <p className="path-line">{entity.path}</p>

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
                    taxonomyConfig={index.taxonomyConfig}
                    rawYaml={editableFrontmatter || "---\n\n---"}
                    onUpdate={(updates) => onUpdateEntity(updates)}
                    onUpdateRawYaml={(yaml) => onChangeFrontmatter(yaml)}
                  />
                </Suspense>
                {parsedRealTimeMetadata && (
                  <div className="metadata-realtime-preview">
                    <h4>Real-time Preview</h4>
                    <dl className="metadata-list">
                      {Object.entries(parsedRealTimeMetadata.data).map(([key, value]) => (
                        <div key={key} className="metadata-pair">
                          <dt>{key}</dt>
                          <dd>{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <h3>Metadata</h3>
            <p className="muted">Open this note in a tab to edit its metadata.</p>
            <dl className="metadata-list">
              <dt>id</dt>
              <dd>{entity.id}</dd>
              <dt>type</dt>
              <dd>{typeDefinition?.label ?? entity.type}</dd>
              <dt>status</dt>
              <dd>{entity.status}</dd>
              {Object.entries(entity.customProperties).map(([key, value]) => (
                <div key={key} className="metadata-pair">
                  <dt>{key}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <section>
        <h3>Links</h3>
        <p className="muted">Wikilinks: {entity.wikilinks.length ? entity.wikilinks.join(", ") : "None"}</p>
      </section>

      <Suspense fallback={<LazyPanelFallback label="Loading backlinks..." />}>
        <BacklinksPanel
          entity={entity}
          allEntities={index.entities}
          onOpenEntity={(path) => {
            onOpenEntity?.(path);
          }}
        />
      </Suspense>

      <section>
        <h3>Findings</h3>
        {findings.length ? (
          <div className="finding-list">
            {findings.map((finding) => (
              <div key={`${finding.code}-${finding.message}`} className="finding-item">
                <FindingBadge finding={finding} />
                <span>{finding.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No findings for this file.</p>
        )}
      </section>
    </aside>
  );
}
