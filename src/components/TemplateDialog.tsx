/**
 * Dialog for managing property templates.
 * Allows users to save, load, and delete templates.
 */

import { useState, useMemo } from "react";
import { X, Download, Upload, Trash2, Save } from "lucide-react";
import type { PropertyDefinition } from "../editorTypes";
import {
  savePropertyTemplate,
  loadPropertyTemplate,
  listPropertyTemplates,
  deletePropertyTemplate,
  createPropertyTemplate,
  searchPropertyTemplates,
  importTemplateFromJSON,
  exportTemplateAsJSON,
} from "../utils/templateManager";
import { useAppDialogs } from "./DialogProvider";

type TemplateDialogMode = "list" | "save" | "load" | "import-export";

type TemplateDialogProps = {
  currentProperties: PropertyDefinition[];
  onLoadTemplate: (properties: PropertyDefinition[]) => void;
  onClose: () => void;
};

export function TemplateDialog({
  currentProperties,
  onLoadTemplate,
  onClose,
}: TemplateDialogProps) {
  const { alertDialog, confirmDialog } = useAppDialogs();
  const [mode, setMode] = useState<TemplateDialogMode>("list");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importJson, setImportJson] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templates = useMemo(() => {
    if (searchQuery.trim()) {
      return searchPropertyTemplates(searchQuery);
    }
    return listPropertyTemplates();
  }, [searchQuery]);

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      void alertDialog("Template name is required");
      return;
    }

    const template = createPropertyTemplate(
      templateName,
      currentProperties,
      templateDescription,
      [],
    );

    savePropertyTemplate(template);
    void alertDialog(`Template "${templateName}" saved successfully`);
    setTemplateName("");
    setTemplateDescription("");
    setMode("list");
  };

  const handleLoadTemplate = (name: string) => {
    const template = loadPropertyTemplate(name);
    if (template) {
      onLoadTemplate(template.definitions);
      onClose();
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    const confirmed = await confirmDialog(`Delete template "${name}"?`, {
      title: "Delete template",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) {
      deletePropertyTemplate(name);
      setSelectedTemplate(null);
    }
  };

  const handleImportTemplate = () => {
    try {
      const template = importTemplateFromJSON(importJson);
      if (template) {
        void alertDialog(`Template "${template.name}" imported successfully`);
        setImportJson("");
        setMode("list");
      }
    } catch (error) {
      void alertDialog(
        `Failed to import: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleExportTemplate = (name: string) => {
    const json = exportTemplateAsJSON(name);
    if (json) {
      // Copy to clipboard
      navigator.clipboard
        .writeText(json)
        .then(() => alertDialog("Template exported to clipboard"))
        .catch(() => {
          // Fallback: show in modal
          void alertDialog("Copy this JSON:\n\n" + json.slice(0, 200) + "...");
        });
    }
  };

  return (
    <div className="template-dialog-overlay" onClick={onClose}>
      <div
        className="template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Property Templates"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="template-dialog-header">
          <h2>Property Templates</h2>
          <button className="close-btn" aria-label="Close templates" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="template-dialog-tabs">
          <button
            className={`tab ${mode === "list" ? "active" : ""}`}
            onClick={() => setMode("list")}
          >
            Browse
          </button>
          <button
            className={`tab ${mode === "save" ? "active" : ""}`}
            onClick={() => setMode("save")}
          >
            Save Current
          </button>
          <button
            className={`tab ${mode === "import-export" ? "active" : ""}`}
            onClick={() => setMode("import-export")}
          >
            Import/Export
          </button>
        </div>

        <div className="template-dialog-content">
          {/* List Mode */}
          {mode === "list" && (
            <>
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="template-search"
              />

              <div className="template-list">
                {templates.length === 0 ? (
                  <div className="template-empty">
                    <p>
                      {searchQuery.trim()
                        ? "No templates match your search"
                        : "No templates saved yet"}
                    </p>
                  </div>
                ) : (
                  templates.map((template) => (
                    <div
                      key={template.name}
                      className={`template-item ${
                        selectedTemplate === template.name ? "selected" : ""
                      }`}
                      onClick={() => setSelectedTemplate(template.name)}
                    >
                      <div className="template-item-header">
                        <h4>{template.name}</h4>
                        <span className="template-item-count">
                          {template.definitions.length} properties
                        </span>
                      </div>
                      {template.description && (
                        <p className="template-item-description">{template.description}</p>
                      )}
                      <div className="template-item-meta">
                        Updated: {new Date(template.updatedAt).toLocaleDateString()}
                      </div>

                      <div className="template-item-actions">
                        <button
                          className="btn-small btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadTemplate(template.name);
                          }}
                        >
                          Load
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportTemplate(template.name);
                          }}
                          title="Export as JSON"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="btn-small btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.name);
                          }}
                          title="Delete template"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Save Mode */}
          {mode === "save" && (
            <div className="template-form">
              <div className="form-group">
                <label>Template Name</label>
                <input
                  type="text"
                  placeholder="e.g., Character Properties"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  placeholder="Describe this template..."
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="form-textarea"
                  rows={3}
                />
              </div>

              <div className="template-preview">
                <strong>Properties to save:</strong>
                <ul>
                  {currentProperties.slice(0, 5).map((prop) => (
                    <li key={prop.id}>{prop.label || prop.id}</li>
                  ))}
                  {currentProperties.length > 5 && (
                    <li>... and {currentProperties.length - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Import/Export Mode */}
          {mode === "import-export" && (
            <div className="template-io-section">
              <div className="io-section">
                <h4>
                  <Upload size={16} /> Import from JSON
                </h4>
                <textarea
                  placeholder="Paste template JSON here..."
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="form-textarea"
                  rows={6}
                />
              </div>
            </div>
          )}
        </div>

        <div className="template-dialog-footer">
          {mode === "list" && (
            <>
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
              {selectedTemplate && (
                <button
                  className="btn-primary"
                  onClick={() => handleLoadTemplate(selectedTemplate)}
                >
                  Load Selected
                </button>
              )}
            </>
          )}

          {mode === "save" && (
            <>
              <button className="btn-secondary" onClick={() => setMode("list")}>
                Back
              </button>
              <button className="btn-primary" onClick={handleSaveTemplate}>
                <Save size={16} /> Save Template
              </button>
            </>
          )}

          {mode === "import-export" && (
            <>
              <button className="btn-secondary" onClick={() => setMode("list")}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleImportTemplate}
                disabled={!importJson.trim()}
              >
                <Upload size={16} /> Import
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
