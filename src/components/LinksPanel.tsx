import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Link2, AlertTriangle } from "lucide-react";
import type { Entity, VaultIndex } from "../domain";
import { resolveWikilinkInIndex } from "../utils/wikilinkResolver";

type LinksPanelProps = {
  entity?: Entity;
  index?: VaultIndex;
  onOpenEntity: (path: string) => void;
};

function contextForLink(entity: Entity, target: string) {
  const normalized = target.trim().toLowerCase();
  const line = entity.body.split("\n").find((candidate) => {
    const matches = candidate.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g);
    if (!matches) return false;
    return matches.some((match) => match.match(/\[\[([^\]|#]+)/)?.[1]?.trim().toLowerCase() === normalized);
  });
  return line ?? "";
}

export function LinksPanel({ entity, index, onOpenEntity }: LinksPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!entity || !index) {
    return (
      <div className="backlinks-panel relationship-panel">
        <h4 className="backlinks-header">Links</h4>
        <p className="muted text-sm">Open a note to see outgoing links.</p>
      </div>
    );
  }

  const links = entity.wikilinks.map((target) => {
    const resolved = resolveWikilinkInIndex(index, target);
    const targetEntity = resolved.targetPath
      ? index.entities.find((candidate) => candidate.path === resolved.targetPath)
      : undefined;
    return {
      target,
      resolved,
      targetEntity,
      context: contextForLink(entity, target),
    };
  });

  if (!links.length) {
    return (
      <div className="backlinks-panel relationship-panel">
        <h4 className="backlinks-header">Links</h4>
        <p className="muted text-sm">No outgoing links from this note.</p>
      </div>
    );
  }

  return (
    <div className="backlinks-panel relationship-panel">
      <button className="backlinks-header" onClick={() => setIsExpanded(!isExpanded)} type="button">
        {isExpanded ? <ChevronDown className="icon-inline" size={16} /> : <ChevronRight className="icon-inline" size={16} />}
        <h4 className="inline">
          Links <span className="muted">({links.length})</span>
        </h4>
      </button>

      {isExpanded ? (
        <ul className="backlinks-list">
          {links.map(({ target, resolved, targetEntity, context }) => (
            <li key={`${target}-${resolved.targetPath ?? "missing"}`} className="backlink-item">
              <button
                className={`backlink-button ${resolved.status === "missing" ? "missing-link" : ""}`}
                onClick={() => resolved.targetPath && onOpenEntity(resolved.targetPath)}
                type="button"
                disabled={!resolved.targetPath}
                title={resolved.targetPath ? `Open ${resolved.targetPath}` : `Missing link: ${target}`}
              >
                <div className="backlink-header">
                  <span className="backlink-name">{targetEntity?.name ?? target}</span>
                  <span className="backlink-type-badge">{targetEntity?.type ?? (resolved.status === "missing" ? "missing" : "note")}</span>
                  {resolved.status === "missing" ? (
                    <AlertTriangle className="backlink-icon" size={14} />
                  ) : (
                    <ExternalLink className="backlink-icon" size={14} />
                  )}
                </div>
                <div className="backlink-context" title={context || target}>
                  <Link2 size={12} />
                  <span>{context || `[[${target}]]`}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
