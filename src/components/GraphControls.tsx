import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { DEFAULT_GRAPH_SETTINGS, type GraphGroupRule, type GraphSettings } from "../editorTypes";

export interface GraphControlsProps {
  settings: GraphSettings;
  availableTypes: string[];
  availableTags: string[];
  nodeCount: number;
  linkCount: number;
  hasActiveNote: boolean;
  onSettingsChange: (settings: GraphSettings) => void;
  onResetView: () => void;
}

type SectionId = "filters" | "groups" | "display" | "forces" | "local";

export function GraphControls({
  settings,
  availableTypes,
  availableTags,
  nodeCount,
  linkCount,
  hasActiveNote,
  onSettingsChange,
  onResetView,
}: GraphControlsProps) {
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set(["filters", "display", "forces", "local"]),
  );

  function patchGraphSettings(patch: Partial<GraphSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  function toggleSection(section: SectionId) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function updateGroup(groupId: string, patch: Partial<GraphGroupRule>) {
    patchGraphSettings({
      groups: settings.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    });
  }

  function addGroup() {
    const colors = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#db2777"];
    const nextGroup: GraphGroupRule = {
      id: `graph-group-${Date.now()}`,
      label: "Group",
      query: availableTypes[0] ? `type:${availableTypes[0]}` : "",
      color: colors[settings.groups.length % colors.length],
    };
    patchGraphSettings({ groups: [...settings.groups, nextGroup] });
  }

  function removeGroup(groupId: string) {
    patchGraphSettings({ groups: settings.groups.filter((group) => group.id !== groupId) });
  }

  return (
    <div className="graph-controls">
      <div className="graph-controls-top">
        <div>
          <h3 className="graph-controls-title">Graph Settings</h3>
          <div className="graph-stats">
            <span className="stat">
              <strong>{nodeCount}</strong> nodes
            </span>
            <span className="stat">
              <strong>{linkCount}</strong> links
            </span>
          </div>
        </div>
        <div className="graph-controls-actions">
          <button type="button" title="Reset view" onClick={onResetView}>
            <RotateCcw size={14} />
          </button>
          <button type="button" title="Restore default settings" onClick={() => onSettingsChange(DEFAULT_GRAPH_SETTINGS)}>
            <X size={14} />
          </button>
        </div>
      </div>

      <GraphSection id="filters" title="Filters" openSections={openSections} onToggle={toggleSection}>
        <div className="graph-search-field">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search files..."
            value={settings.searchQuery}
            onChange={(event) => patchGraphSettings({ searchQuery: event.target.value })}
          />
          {settings.searchQuery ? (
            <button type="button" onClick={() => patchGraphSettings({ searchQuery: "" })}>
              <X size={13} />
            </button>
          ) : null}
        </div>
        <GraphCheckbox label="Tags" checked={settings.showTags} onChange={(showTags) => patchGraphSettings({ showTags })} />
        <GraphCheckbox
          label="Existing files only"
          checked={settings.existingFilesOnly}
          onChange={(existingFilesOnly) => patchGraphSettings({ existingFilesOnly })}
        />
        <GraphCheckbox
          label="Orphans"
          checked={settings.showOrphans}
          onChange={(showOrphans) => patchGraphSettings({ showOrphans })}
        />
        <GraphCheckbox
          label="Wikilinks"
          checked={settings.showWikilinks}
          onChange={(showWikilinks) => patchGraphSettings({ showWikilinks })}
        />
        <GraphCheckbox
          label="Hierarchy"
          checked={settings.showHierarchy}
          onChange={(showHierarchy) => patchGraphSettings({ showHierarchy })}
        />
        <GraphCheckbox
          label="Shared tags"
          checked={settings.showTagRelations}
          onChange={(showTagRelations) => patchGraphSettings({ showTagRelations })}
        />
      </GraphSection>

      <GraphSection id="groups" title="Groups" openSections={openSections} onToggle={toggleSection}>
        <button type="button" className="graph-add-group" onClick={addGroup}>
          <Plus size={14} />
          New group
        </button>
        <div className="graph-group-list">
          {settings.groups.map((group) => (
            <div className="graph-group-rule" key={group.id}>
              <input
                aria-label="Group color"
                type="color"
                value={group.color}
                onChange={(event) => updateGroup(group.id, { color: event.target.value })}
              />
              <input
                aria-label="Group label"
                value={group.label}
                onChange={(event) => updateGroup(group.id, { label: event.target.value })}
              />
              <input
                aria-label="Group query"
                placeholder="type:character, tag:lore..."
                value={group.query}
                onChange={(event) => updateGroup(group.id, { query: event.target.value })}
              />
              <button type="button" title="Delete group" onClick={() => removeGroup(group.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!settings.groups.length ? <p className="graph-empty-hint">Color notes by type, tag, or text query.</p> : null}
        </div>
        {availableTags.length ? (
          <p className="graph-empty-hint">Available tags: {availableTags.slice(0, 8).map((tag) => `#${tag}`).join(", ")}</p>
        ) : null}
      </GraphSection>

      <GraphSection id="display" title="Display" openSections={openSections} onToggle={toggleSection}>
        <GraphCheckbox label="Arrows" checked={settings.showArrows} onChange={(showArrows) => patchGraphSettings({ showArrows })} />
        <GraphSlider
          label="Text fade threshold"
          min={0}
          max={1}
          step={0.05}
          value={settings.textFadeThreshold}
          onChange={(textFadeThreshold) => patchGraphSettings({ textFadeThreshold })}
        />
        <GraphSlider
          label="Node size"
          min={0.5}
          max={2.5}
          step={0.1}
          value={settings.nodeSize}
          onChange={(nodeSize) => patchGraphSettings({ nodeSize })}
        />
        <GraphSlider
          label="Link thickness"
          min={0.5}
          max={3}
          step={0.1}
          value={settings.linkThickness}
          onChange={(linkThickness) => patchGraphSettings({ linkThickness })}
        />
      </GraphSection>

      <GraphSection id="forces" title="Forces" openSections={openSections} onToggle={toggleSection}>
        <GraphSlider
          label="Center force"
          min={0}
          max={0.3}
          step={0.01}
          value={settings.centerForce}
          onChange={(centerForce) => patchGraphSettings({ centerForce })}
        />
        <GraphSlider
          label="Repel force"
          min={40}
          max={600}
          step={10}
          value={settings.repelForce}
          onChange={(repelForce) => patchGraphSettings({ repelForce })}
        />
        <GraphSlider
          label="Link force"
          min={0}
          max={1}
          step={0.05}
          value={settings.linkForce}
          onChange={(linkForce) => patchGraphSettings({ linkForce })}
        />
        <GraphSlider
          label="Link distance"
          min={30}
          max={260}
          step={5}
          value={settings.linkDistance}
          onChange={(linkDistance) => patchGraphSettings({ linkDistance })}
        />
      </GraphSection>

      <GraphSection id="local" title="Local graph" openSections={openSections} onToggle={toggleSection}>
        <div className="button-group graph-mode-group">
          <button
            className={`btn-group-item ${settings.mode === "global" ? "active" : ""}`}
            onClick={() => patchGraphSettings({ mode: "global" })}
            type="button"
          >
            Global
          </button>
          <button
            className={`btn-group-item ${settings.mode === "local" ? "active" : ""}`}
            onClick={() => patchGraphSettings({ mode: "local" })}
            type="button"
            disabled={!hasActiveNote}
            title={hasActiveNote ? "Show local graph" : "Open a note to use local graph"}
          >
            Local
          </button>
        </div>
        <GraphSlider
          label="Depth"
          min={1}
          max={5}
          step={1}
          value={settings.depth}
          onChange={(depth) => patchGraphSettings({ depth })}
          disabled={settings.mode !== "local"}
        />
      </GraphSection>
    </div>
  );
}

function GraphSection({
  id,
  title,
  openSections,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  openSections: Set<SectionId>;
  onToggle: (section: SectionId) => void;
  children: React.ReactNode;
}) {
  const isOpen = openSections.has(id);
  return (
    <section className="graph-controls-section">
      <button type="button" className="filter-header" onClick={() => onToggle(id)}>
        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="control-label">{title}</span>
      </button>
      {isOpen ? <div className="graph-section-body">{children}</div> : null}
    </section>
  );
}

function GraphCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-item">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function GraphSlider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`graph-slider-field ${disabled ? "disabled" : ""}`}>
      <span>
        {label}: <strong>{Number.isInteger(value) ? value : value.toFixed(2)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="slider"
      />
    </label>
  );
}
