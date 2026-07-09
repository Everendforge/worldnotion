import { Check, FileDiff, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { lineDiff, type IndexedCanonChangeSet } from "../utils/canonChangeSets";

export function CanonChangesDialog({
  open,
  changes,
  onApply,
  onDismiss,
  onRefresh,
  onClose,
}: {
  open: boolean;
  changes: IndexedCanonChangeSet[];
  onApply: (change: IndexedCanonChangeSet) => void;
  onDismiss: (change: IndexedCanonChangeSet) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  if (!open) return null;
  const selected = changes.find((change) => change.id === selectedId) ?? changes[0];
  return (
    <div className="modal-backdrop canon-changes-backdrop">
      <section className="modal-dialog canon-changes-dialog" aria-label="Cross-app changes">
        <header>
          <div>
            <h2>Changes between apps</h2>
            <p>Manual Canon proposals stored in `.everend/changes`.</p>
          </div>
          <button type="button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="canon-changes-layout">
          <div className="canon-change-list">
            {changes.map((change) => (
              <button
                type="button"
                key={change.id}
                className={selected?.id === change.id ? "active" : ""}
                onClick={() => setSelectedId(change.id)}
              >
                <strong>{change.target.entityId}</strong>
                <span>
                  {change.sourceApp} · {change.status}
                </span>
              </button>
            ))}
            {!changes.length ? <p className="muted">No change sets found.</p> : null}
          </div>
          {selected ? (
            <article className="canon-change-detail">
              <div className="canon-change-meta">
                <strong>{selected.target.entityId}</strong>
                <span>{selected.target.path}</span>
                <span>
                  {selected.status} · revision {selected.revision}
                </span>
              </div>
              <h3>
                <FileDiff size={15} /> Differences
              </h3>
              <pre>
                {selected.proposed.diff ??
                  lineDiff(selected.base.content, selected.proposed.content)}
              </pre>
              <div className="inspector-actions">
                <button
                  type="button"
                  disabled={selected.status === "applied" || selected.status === "dismissed"}
                  onClick={() => onApply(selected)}
                >
                  <Check size={14} /> Apply after check
                </button>
                <button
                  type="button"
                  disabled={selected.status === "applied" || selected.status === "dismissed"}
                  onClick={() => onDismiss(selected)}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ) : (
            <article className="canon-change-detail">
              <p className="muted">Select a proposal to review it.</p>
            </article>
          )}
        </div>
        <footer>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh manually
          </button>
        </footer>
      </section>
    </div>
  );
}
