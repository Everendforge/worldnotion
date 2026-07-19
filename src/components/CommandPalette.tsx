import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse, { type IFuseOptions } from "fuse.js";
import {
  FileText,
  Hash,
  Terminal,
  ChevronRight,
  Clock,
  Star,
  Search,
  X,
  Filter,
} from "lucide-react";
import {
  CommandPaletteMode,
  CommandPaletteResult,
  FileResult,
  CommandResult,
  HeaderResult,
  TagResult,
  EditorCommandId,
  FileAccessStats,
  TaxonomyConfig,
} from "../editorTypes";
import { getFileFrequencyScore } from "../utils/fileAccessStats";
import { useWorldnotionUi } from "../i18n";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: CommandPaletteMode;
  fileResults: FileResult[];
  commandResults: CommandResult[];
  headerResults: HeaderResult[];
  tagResults: TagResult[];
  recentFiles?: string[];
  favorites?: string[];
  fileAccessStats?: FileAccessStats[];
  quickSwitcherMode?: boolean;
  taxonomyConfig?: TaxonomyConfig;
  onSelectFile: (path: string) => void;
  onSelectCommand: (commandId: EditorCommandId) => void;
  onSelectHeader: (line: number) => void;
  onSelectTag: (tag: string) => void;
}

const FUSE_OPTIONS_FILES: IFuseOptions<FileResult> = {
  keys: [
    { name: "title", weight: 2 },
    { name: "path", weight: 1 },
    { name: "tags", weight: 0.5 },
    { name: "entityType", weight: 0.8 },
    { name: "status", weight: 0.6 },
  ],
  threshold: 0.4,
  includeScore: true,
};

const FUSE_OPTIONS_COMMANDS: IFuseOptions<CommandResult> = {
  keys: [
    { name: "title", weight: 2 },
    { name: "subtitle", weight: 1 },
    { name: "group", weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
};

const FUSE_OPTIONS_HEADERS: IFuseOptions<HeaderResult> = {
  keys: ["title"],
  threshold: 0.3,
  includeScore: true,
};

const FUSE_OPTIONS_TAGS: IFuseOptions<TagResult> = {
  keys: ["tag", "title"],
  threshold: 0.3,
  includeScore: true,
};

function getResultIcon(result: CommandPaletteResult) {
  switch (result.type) {
    case "file":
      return <FileText className="result-icon" size={18} />;
    case "command":
      return <Terminal className="result-icon" size={18} />;
    case "header":
      return <Hash className="result-icon" size={18} />;
    case "tag":
      return <Hash className="result-icon" size={18} />;
  }
}

export function CommandPalette({
  isOpen,
  onClose,
  mode = "files",
  fileResults,
  commandResults,
  headerResults,
  tagResults,
  recentFiles = [],
  favorites = [],
  fileAccessStats,
  quickSwitcherMode = false,
  taxonomyConfig,
  onSelectFile,
  onSelectCommand,
  onSelectHeader,
  onSelectTag,
}: CommandPaletteProps) {
  const ui = useWorldnotionUi();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeMode, setActiveMode] = useState<CommandPaletteMode>(mode);
  const [filterEntityType, setFilterEntityType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Detect mode from query prefix (disabled in Quick Switcher mode)
  useEffect(() => {
    if (quickSwitcherMode) {
      setActiveMode("files");
      return;
    }

    if (query.startsWith("@")) {
      setActiveMode("headers");
    } else if (query.startsWith("#")) {
      setActiveMode("tags");
    } else if (query.startsWith(">")) {
      setActiveMode("commands");
    } else if (!query.startsWith("@") && !query.startsWith("#") && !query.startsWith(">")) {
      setActiveMode("files");
    }
  }, [query, quickSwitcherMode]);

  // Get search query without prefix
  const searchQuery = useMemo(() => {
    if (query.startsWith("@") || query.startsWith("#") || query.startsWith(">")) {
      return query.slice(1).trim();
    }
    return query;
  }, [query]);

  // Apply entity type and status filters first
  const filteredFiles = useMemo(() => {
    let files = fileResults;
    if (filterEntityType) {
      files = files.filter((f) => f.entityType === filterEntityType);
    }
    if (filterStatus) {
      files = files.filter((f) => f.status === filterStatus);
    }
    return files;
  }, [fileResults, filterEntityType, filterStatus]);

  // Memoize Fuse instances so typing only re-runs the search, not the indexing
  const filesFuse = useMemo(() => new Fuse(filteredFiles, FUSE_OPTIONS_FILES), [filteredFiles]);
  const commandsFuse = useMemo(
    () => new Fuse(commandResults, FUSE_OPTIONS_COMMANDS),
    [commandResults],
  );
  const headersFuse = useMemo(() => new Fuse(headerResults, FUSE_OPTIONS_HEADERS), [headerResults]);
  const tagsFuse = useMemo(() => new Fuse(tagResults, FUSE_OPTIONS_TAGS), [tagResults]);

  // Perform fuzzy search
  const results = useMemo(() => {
    let items: CommandPaletteResult[] = [];

    switch (activeMode) {
      case "files": {
        if (!searchQuery) {
          // En Quick Switcher mode o sin query, mostrar por frecuencia
          if (quickSwitcherMode && fileAccessStats && fileAccessStats.length > 0) {
            items = [...filteredFiles]
              .map((file) => ({
                file,
                score: getFileFrequencyScore(fileAccessStats, file.path),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 15)
              .map((item) => item.file);
          } else if (quickSwitcherMode) {
            // Si no hay stats aún, mostrar todos los archivos limitados
            items = filteredFiles.slice(0, 15);
          } else if (fileAccessStats && fileAccessStats.length > 0) {
            items = [...filteredFiles]
              .map((file) => ({
                file,
                score: getFileFrequencyScore(fileAccessStats, file.path),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 15)
              .map((item) => item.file);
          } else {
            // Fallback a recientes y favoritos
            const recentItems = filteredFiles
              .filter((f) => recentFiles.includes(f.path))
              .slice(0, 5);
            const favoriteItems = filteredFiles
              .filter((f) => favorites.includes(f.path))
              .slice(0, 5);
            items = [...recentItems, ...favoriteItems];
          }
        } else {
          // Con query, usar fuzzy search pero ajustar scores por frecuencia
          const searchResults = filesFuse.search(searchQuery);

          if (fileAccessStats) {
            // Combinar Fuse score con frecuencia
            items = searchResults
              .map((result) => {
                const fuseScore = 1 - (result.score || 0); // Invertir (mayor es mejor)
                const freqScore = getFileFrequencyScore(fileAccessStats, result.item.path);
                // 60% fuzzy match, 40% frecuencia
                const combinedScore = fuseScore * 0.6 + freqScore * 0.4;
                return { item: result.item, combinedScore };
              })
              .sort((a, b) => b.combinedScore - a.combinedScore)
              .map((r) => r.item);
          } else {
            items = searchResults.map((result) => result.item);
          }
        }
        break;
      }
      case "commands": {
        if (!searchQuery) {
          items = commandResults;
        } else {
          items = commandsFuse.search(searchQuery).map((result) => result.item);
        }
        break;
      }
      case "headers": {
        if (!searchQuery) {
          items = headerResults;
        } else {
          items = headersFuse.search(searchQuery).map((result) => result.item);
        }
        break;
      }
      case "tags": {
        if (!searchQuery) {
          items = tagResults;
        } else {
          items = tagsFuse.search(searchQuery).map((result) => result.item);
        }
        break;
      }
    }

    return items.slice(0, quickSwitcherMode ? 15 : 8);
  }, [
    activeMode,
    searchQuery,
    filteredFiles,
    filesFuse,
    commandResults,
    commandsFuse,
    headerResults,
    headersFuse,
    tagResults,
    tagsFuse,
    recentFiles,
    favorites,
    fileAccessStats,
    quickSwitcherMode,
  ]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to ensure focus happens after render
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (result: CommandPaletteResult) => {
      switch (result.type) {
        case "file":
          onSelectFile(result.path);
          break;
        case "command":
          onSelectCommand(result.commandId);
          break;
        case "header":
          onSelectHeader(result.line);
          break;
        case "tag":
          onSelectTag(result.tag);
          break;
      }
      onClose();
    },
    [onSelectFile, onSelectCommand, onSelectHeader, onSelectTag, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  const entityTypes = taxonomyConfig?.entityTypes.definitions ?? [];
  const statuses = taxonomyConfig?.statuses.definitions ?? [];

  return (
    <div className="command-palette-backdrop" onClick={handleBackdropClick}>
      <div className="command-palette">
        <div className="command-palette-header">
          <Search className="search-icon" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            autoFocus
            placeholder={
              activeMode === "files"
                ? ui.searchFiles
                : activeMode === "headers"
                  ? ui.searchHeaders
                  : activeMode === "tags"
                    ? ui.searchTags
                    : ui.searchCommands
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="clear-button" onClick={() => setQuery("")} aria-label={ui.clearSearch}>
              <X size={16} />
            </button>
          )}
          {activeMode === "files" &&
            taxonomyConfig &&
            (entityTypes.length > 0 || statuses.length > 0) && (
              <button
                className="filter-toggle-button"
                onClick={() => setShowFilters(!showFilters)}
                aria-label={ui.toggleFilters}
                title={ui.filterByTypeOrStatus}
              >
                <Filter size={16} />
              </button>
            )}
        </div>

        {/* Taxonomy Filters */}
        {showFilters && activeMode === "files" && taxonomyConfig && (
          <div className="command-palette-filters">
            {entityTypes.length > 0 && (
              <div className="filter-group">
                <label>{ui.type}</label>
                <select
                  value={filterEntityType || ""}
                  onChange={(e) => setFilterEntityType(e.target.value || null)}
                >
                  <option value="">{ui.allTypes}</option>
                  {entityTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {statuses.length > 0 && (
              <div className="filter-group">
                <label>{ui.status}</label>
                <select
                  value={filterStatus || ""}
                  onChange={(e) => setFilterStatus(e.target.value || null)}
                >
                  <option value="">{ui.allStatuses}</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(filterEntityType || filterStatus) && (
              <button
                className="clear-filters-button"
                onClick={() => {
                  setFilterEntityType(null);
                  setFilterStatus(null);
                }}
              >
                {ui.clearFilters}
              </button>
            )}
          </div>
        )}

        <div className="command-palette-results" ref={resultsRef}>
          {results.length === 0 ? (
            <div className="no-results">
              {ui.noResults}
              {activeMode === "files" && query && (
                <div className="no-results-hint">
                  {ui.searchHint}
                </div>
              )}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                className={`command-palette-result ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="result-icon-container">{getResultIcon(result)}</div>
                <div className="result-content">
                  <div className="result-title">
                    {result.title}
                    {result.type === "file" &&
                      recentFiles.includes((result as FileResult).path) && (
                        <Clock className="recent-indicator" size={14} />
                      )}
                    {result.type === "file" && favorites.includes((result as FileResult).path) && (
                      <Star className="favorite-indicator" size={14} />
                    )}
                  </div>
                  {result.subtitle && <div className="result-subtitle">{result.subtitle}</div>}

                  {/* Taxonomy badges for file results */}
                  {result.type === "file" && (
                    <div className="result-taxonomy">
                      {(result as FileResult).entityType && (
                        <span className="taxonomy-badge type-badge">
                          {entityTypes.find((t) => t.id === (result as FileResult).entityType)
                            ?.label || (result as FileResult).entityType}
                        </span>
                      )}
                      {(result as FileResult).status && (
                        <span className="taxonomy-badge status-badge">
                          {statuses.find((s) => s.id === (result as FileResult).status)?.label ||
                            (result as FileResult).status}
                        </span>
                      )}
                      {(result as FileResult).tags && (result as FileResult).tags!.length > 0 && (
                        <span className="taxonomy-badge tags-badge">
                          {(result as FileResult)
                            .tags!.slice(0, 3)
                            .map((tag) => {
                              const parts = tag.split("/");
                              return parts[parts.length - 1];
                            })
                            .join(", ")}
                          {(result as FileResult).tags!.length > 3 &&
                            ` +${(result as FileResult).tags!.length - 3}`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hierarchical tag display */}
                  {result.type === "tag" && (result as TagResult).fullPath && (
                    <div className="result-tag-path">{(result as TagResult).fullPath}</div>
                  )}

                  {result.type === "command" && result.shortcut && (
                    <div className="result-shortcut">{result.shortcut}</div>
                  )}
                </div>
                <ChevronRight className="result-arrow" size={16} />
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <div className="palette-mode-indicator">
            {activeMode === "files" && <span>📄 {ui.files}</span>}
            {activeMode === "headers" && <span>📑 {ui.headers}</span>}
            {activeMode === "tags" && <span>🏷️ {ui.tags}</span>}
            {activeMode === "commands" && <span>⌘ {ui.commands}</span>}
          </div>
          <div className="palette-hints">
            {ui.navigateSelectClose}
          </div>
        </div>
      </div>
    </div>
  );
}
