import { useState } from "react";
import { Hash } from "lucide-react";
import type { PropertiesConfig } from "../editorTypes";
import { TagHierarchyEditor } from "./TagHierarchyEditor";
import "../App.css";

type PropertiesManagerProps = {
  config: PropertiesConfig;
  onChange: (config: PropertiesConfig) => void;
};

export function PropertiesManager({ config, onChange }: PropertiesManagerProps) {
  const [showTagSettings, setShowTagSettings] = useState(true);

  return (
    <div className="ecosystem-manager">
      <div className="ecosystem-tabs">
        <button
          className="ecosystem-tab active"
          onClick={() => setShowTagSettings((current) => !current)}
          type="button"
          aria-expanded={showTagSettings}
        >
          <Hash size={18} />
          <div className="tab-info">
            <span className="tab-title">Etiquetas</span>
            <span className="tab-subtitle">{config.tags.rootNodes.length} categorías</span>
          </div>
        </button>
      </div>

      <div className="ecosystem-content">
          <div className="ecosystem-panel">
            {showTagSettings ? (
            <div className="panel-settings">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={config.tags.allowCustomTags}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      tags: { ...config.tags, allowCustomTags: e.target.checked },
                    })
                  }
                />
                <div className="setting-info">
                  <span className="setting-label">Permitir etiquetas personalizadas</span>
                  <span className="setting-description">Acepta etiquetas que no estén en la jerarquía</span>
                </div>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={config.tags.autoDetectSlashNotation}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      tags: { ...config.tags, autoDetectSlashNotation: e.target.checked },
                    })
                  }
                />
                <div className="setting-info">
                  <span className="setting-label">Auto-detectar notación de barras</span>
                  <span className="setting-description">Reconoce automáticamente la estructura jerárquica</span>
                </div>
              </label>
            </div>
            ) : null}
            <TagHierarchyEditor
              nodes={config.tags.rootNodes}
              onChange={(rootNodes) =>
                onChange({
                  ...config,
                  tags: { ...config.tags, rootNodes },
                })
              }
            />
          </div>
      </div>
    </div>
  );
}

export const TaxonomyManager = PropertiesManager;
