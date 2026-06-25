import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { Entity } from "../domain";

export interface BacklinksPanelProps {
  /**
   * The entity whose backlinks to display
   */
  entity?: Entity;
  /**
   * All entities in the vault (to resolve backlink references)
   */
  allEntities: Entity[];
  /**
   * Callback when a backlink is clicked
   */
  onOpenEntity: (entityPath: string) => void;
}

/**
 * Interactive panel showing backlinks to the current entity.
 * Displays context (the line containing the wikilink) and allows
 * direct navigation to source entities.
 */
export function BacklinksPanel({ entity, allEntities, onOpenEntity }: BacklinksPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!entity) {
    return (
      <div className="backlinks-panel relationship-panel">
        <h4 className="backlinks-header">Backlinks</h4>
        <p className="muted text-sm">Open a note to see backlinks.</p>
      </div>
    );
  }

  // Resolve backlinks to actual entities
  const backlinks = entity.backlinks
    .map((id) => allEntities.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Entity => Boolean(candidate));

  // Extract context for each backlink (line containing the wikilink)
  const backlinksWithContext = backlinks.map((backlinkEntity) => {
    // Find the line in the backlink entity's body that mentions this entity
    const lines = backlinkEntity.body.split("\n");
    const targetName = entity.name.toLowerCase();
    const targetAliases = entity.aliases.map((alias) => alias.toLowerCase());
    
    // Search for wikilink references to this entity
    const contextLine = lines.find((line) => {
      const wikilinkMatches = line.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g);
      if (!wikilinkMatches) return false;
      
      return wikilinkMatches.some((match) => {
        const target = match.match(/\[\[([^\]|#]+)/)?.[1]?.trim().toLowerCase();
        return target === targetName || targetAliases.includes(target || "");
      });
    });

    return {
      entity: backlinkEntity,
      context: contextLine || backlinkEntity.body.split("\n")[0] || "",
    };
  });

  if (backlinks.length === 0) {
    return (
      <div className="backlinks-panel">
        <h4 className="backlinks-header">Backlinks</h4>
        <p className="muted text-sm">No backlinks to this note.</p>
      </div>
    );
  }

  return (
    <div className="backlinks-panel">
      <button
        className="backlinks-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        {isExpanded ? (
          <ChevronDown className="icon-inline" size={16} />
        ) : (
          <ChevronRight className="icon-inline" size={16} />
        )}
        <h4 className="inline">
          Backlinks <span className="muted">({backlinks.length})</span>
        </h4>
      </button>

      {isExpanded && (
        <ul className="backlinks-list">
          {backlinksWithContext.map(({ entity: backlinkEntity, context }) => (
            <li key={backlinkEntity.id} className="backlink-item">
              <button
                className="backlink-button"
                onClick={() => onOpenEntity(backlinkEntity.path)}
                type="button"
                title={`Open ${backlinkEntity.name}`}
              >
                <div className="backlink-header">
                  <span className="backlink-name">{backlinkEntity.name}</span>
                  <span className="backlink-type-badge">{backlinkEntity.type}</span>
                  <ExternalLink className="backlink-icon" size={14} />
                </div>
                {context && (
                  <div className="backlink-context" title={context}>
                    {context}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
