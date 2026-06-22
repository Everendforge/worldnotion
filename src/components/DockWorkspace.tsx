import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import type { DockGroupNode, DockNode, DockSplitNode, DockTabRef, DocumentTabGroup, WorkspaceLayoutV1 } from "../editorTypes";
import { isDockMoveAllowedAroundDocumentAnchor, type DockDropPosition } from "../utils/workspaceLayout";

export type DockMoveRequest = {
  tabId: string;
  sourceGroupId: string;
  targetGroupId: string;
  position: DockDropPosition;
  targetTabId?: string;
};

export type DockWorkspaceProps = {
  layout: WorkspaceLayoutV1;
  renderTab: (tab: DockTabRef) => ReactNode;
  dirtyDocumentPaths?: Set<string>;
  documentTabGroups?: DocumentTabGroup[];
  onSelectTab: (tab: DockTabRef, groupId: string) => void;
  onCloseTab: (tab: DockTabRef) => void;
  onTabContextMenu?: (tab: DockTabRef, x: number, y: number) => void;
  onGroupContextMenu?: (groupId: string, x: number, y: number) => void;
  onMoveTab: (request: DockMoveRequest) => void;
  onDocumentGroupToggle?: (group: DocumentTabGroup) => void;
  onDocumentGroupContextMenu?: (group: DocumentTabGroup, x: number, y: number) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onOpenDocument: () => void;
};

type DockDragHandleKind = "tab" | "group-header";

type DraggedDockTab = {
  tabId: string;
  sourceGroupId: string;
  title: string;
  handleKind: DockDragHandleKind;
};

type DockPointerDragInput = {
  tab: DockTabRef;
  groupId: string;
  handleKind: DockDragHandleKind;
  pointerId: number;
  startX: number;
  startY: number;
};

type DockDropTarget = {
  groupId: string;
  position: DockDropPosition;
  targetTabId?: string;
};

type DockDragState = {
  item: DraggedDockTab;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target?: DockDropTarget;
};

const DOCK_DRAG_THRESHOLD = 4;
const DOCK_EDGE_ZONE_RATIO = 0.26;

const INTERACTIVE_DOCK_SELECTOR = "button, input, textarea, select, a, [data-dock-no-drag='true']";

export function DockWorkspace({
  layout,
  renderTab,
  dirtyDocumentPaths,
  documentTabGroups,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onGroupContextMenu,
  onMoveTab,
  onDocumentGroupToggle,
  onDocumentGroupContextMenu,
  onResizeSplit,
  onOpenDocument,
}: DockWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dragController = useDockDragController({
    workspaceRef,
    onMoveTab,
  });

  return (
    <div
      ref={workspaceRef}
      className={`dock-workspace ${dragController.dragState?.active ? "is-dock-dragging" : ""}`}
    >
      <DockNodeView
        node={layout.root}
        activeGroupId={layout.activeGroupId}
        dragState={dragController.dragState}
        renderTab={renderTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onTabContextMenu={onTabContextMenu}
        onGroupContextMenu={onGroupContextMenu}
        onMoveTab={onMoveTab}
        onDocumentGroupToggle={onDocumentGroupToggle}
        onDocumentGroupContextMenu={onDocumentGroupContextMenu}
        onResizeSplit={onResizeSplit}
        onOpenDocument={onOpenDocument}
        dirtyDocumentPaths={dirtyDocumentPaths}
        documentTabGroups={documentTabGroups}
        onPointerDragStart={dragController.startDrag}
      />
      {dragController.dragState?.active ? <DockDragGhost dragState={dragController.dragState} /> : null}
    </div>
  );
}

type DockNodeViewProps = Omit<DockWorkspaceProps, "layout"> & {
  node: DockNode;
  activeGroupId: string;
  dragState?: DockDragState;
  onPointerDragStart: (input: DockPointerDragInput) => void;
};

function DockNodeView(props: DockNodeViewProps) {
  const { node } = props;

  if (node.type === "group") {
    return <DockGroup {...props} group={node} />;
  }

  return (
    <div
      className={`dock-split dock-split-${node.direction}`}
      style={{ "--dock-first-size": `${node.ratio * 100}%` } as CSSProperties}
    >
      <DockNodeView {...props} node={node.first} />
      <DockSplitter split={node} onResizeSplit={props.onResizeSplit} />
      <DockNodeView {...props} node={node.second} />
    </div>
  );
}

function DockSplitter({
  split,
  onResizeSplit,
}: {
  split: DockSplitNode;
  onResizeSplit: DockWorkspaceProps["onResizeSplit"];
}) {
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const splitterElement = event.currentTarget;
    const splitElement = splitterElement.parentElement;
    if (!splitElement) return;
    const rect = splitElement.getBoundingClientRect();
    splitterElement.setPointerCapture(event.pointerId);
    event.preventDefault();

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const rawRatio =
        split.direction === "horizontal"
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height;
      onResizeSplit(split.id, rawRatio);
    }

    function handlePointerUp(upEvent: globalThis.PointerEvent) {
      if (splitterElement.hasPointerCapture(upEvent.pointerId)) {
        splitterElement.releasePointerCapture(upEvent.pointerId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={split.direction === "horizontal" ? "vertical" : "horizontal"}
      className="dock-splitter"
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onResizeSplit(split.id, 0.5)}
      onKeyDown={(event) => {
        const delta = event.shiftKey ? 0.08 : 0.03;
        if (split.direction === "horizontal") {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onResizeSplit(split.id, split.ratio - delta);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onResizeSplit(split.id, split.ratio + delta);
          }
        } else {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onResizeSplit(split.id, split.ratio - delta);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onResizeSplit(split.id, split.ratio + delta);
          }
        }
      }}
      title="Drag to resize"
    />
  );
}

type DockGroupProps = Omit<DockNodeViewProps, "node"> & {
  group: DockGroupNode;
};

function DockGroup({
  group,
  activeGroupId,
  dragState,
  renderTab,
  dirtyDocumentPaths,
  documentTabGroups,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onGroupContextMenu,
  onDocumentGroupToggle,
  onDocumentGroupContextMenu,
  onOpenDocument,
  onPointerDragStart,
}: DockGroupProps) {
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId) ?? group.tabs[0];
  const isDragOver = dragState?.active && dragState.target?.groupId === group.id;

  return (
    <section
      className={`dock-group ${isDragOver ? "is-drag-over" : ""}`}
      data-dock-group-id={group.id}
      data-active-group={group.id === activeGroupId ? "true" : "false"}
    >
      <DockTabBar
        group={group}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onTabContextMenu={onTabContextMenu}
        onGroupContextMenu={onGroupContextMenu}
        onDocumentGroupToggle={onDocumentGroupToggle}
        onDocumentGroupContextMenu={onDocumentGroupContextMenu}
        onOpenDocument={onOpenDocument}
        onPointerDragStart={onPointerDragStart}
        dirtyDocumentPaths={dirtyDocumentPaths}
        documentTabGroups={documentTabGroups}
      />
      <div className="dock-group-content">{activeTab ? renderTab(activeTab) : <EmptyDockGroup groupId={group.id} />}</div>
      {isDragOver ? <DockDropOverlay target={dragState.target} /> : null}
    </section>
  );
}

type DockTabBarProps = {
  group: DockGroupNode;
  activeTab?: DockTabRef;
  dirtyDocumentPaths?: Set<string>;
  documentTabGroups?: DocumentTabGroup[];
  onSelectTab: DockWorkspaceProps["onSelectTab"];
  onCloseTab: DockWorkspaceProps["onCloseTab"];
  onTabContextMenu?: DockWorkspaceProps["onTabContextMenu"];
  onGroupContextMenu?: DockWorkspaceProps["onGroupContextMenu"];
  onDocumentGroupToggle?: DockWorkspaceProps["onDocumentGroupToggle"];
  onDocumentGroupContextMenu?: DockWorkspaceProps["onDocumentGroupContextMenu"];
  onOpenDocument: () => void;
  onPointerDragStart: (input: DockPointerDragInput) => void;
};

function DockTabBar({
  group,
  activeTab,
  dirtyDocumentPaths,
  documentTabGroups = [],
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onGroupContextMenu,
  onDocumentGroupToggle,
  onDocumentGroupContextMenu,
  onOpenDocument,
  onPointerDragStart,
}: DockTabBarProps) {
  const documentTabs = group.tabs.filter((tab) => tab.kind === "document");
  const panelTabs = group.tabs.filter((tab) => tab.kind !== "document");
  const isWritingGroup = group.id === "dock-documents";

  function startDragFromEvent(event: PointerEvent<HTMLElement>, tab: DockTabRef, handleKind: DockDragHandleKind) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE_DOCK_SELECTOR)) return;
    event.preventDefault();
    onPointerDragStart({
      tab,
      groupId: group.id,
      handleKind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function tabIsDirty(tab: DockTabRef) {
    return Boolean(tab.kind === "document" && tab.path && dirtyDocumentPaths?.has(tab.path));
  }

  function renderTabButton(tab: DockTabRef) {
    return (
      <div
        key={tab.id}
        role="button"
        tabIndex={0}
        className={`dock-tab dock-tab-${tab.kind === "document" ? "document" : "panel"} ${tab.id === group.activeTabId ? "active" : ""}`}
        data-dock-tab-id={tab.id}
        data-dock-tab-kind={tab.kind}
        data-dragging="false"
        onClick={() => onSelectTab(tab, group.id)}
        onContextMenu={(event) => {
          if (!onTabContextMenu) return;
          event.preventDefault();
          event.stopPropagation();
          if (tab.kind === "document") {
            onTabContextMenu(tab, event.clientX, event.clientY);
            return;
          }
          onGroupContextMenu?.(group.id, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectTab(tab, group.id);
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDragFromEvent(event, tab, "tab");
        }}
        title={tab.path ?? tab.title}
      >
        <span>{tab.title}</span>
        {tabIsDirty(tab) ? (
          <strong className="dock-tab-dirty" aria-label="Unsaved changes" title="Unsaved changes">
            *
          </strong>
        ) : null}
        <button
          type="button"
          className="dock-tab-close"
          data-dock-no-drag="true"
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab(tab);
          }}
          title="Close tab"
        >
          <X size={9} />
        </button>
      </div>
    );
  }

  function renderDocumentTabs() {
    const tabByPath = new Map(documentTabs.filter((tab) => tab.path).map((tab) => [tab.path as string, tab]));
    const groupByPath = new Map<string, DocumentTabGroup>();
    for (const group of documentTabGroups) {
      for (const path of group.tabPaths) {
        groupByPath.set(path, group);
      }
    }
    const renderedGroups = new Set<string>();

    return documentTabs.map((tab) => {
      const path = tab.path;
      const tabGroup = path ? groupByPath.get(path) : undefined;
      if (!tabGroup) return renderTabButton(tab);
      if (renderedGroups.has(tabGroup.id)) return null;
      renderedGroups.add(tabGroup.id);
      const groupTabs = tabGroup.tabPaths.map((groupPath) => tabByPath.get(groupPath)).filter((candidate): candidate is DockTabRef => Boolean(candidate));
      const groupDirty = groupTabs.some(tabIsDirty);
      return (
        <div
          key={tabGroup.id}
          className={`dock-document-tab-group ${tabGroup.collapsed ? "collapsed" : ""}`}
          style={{ "--document-tab-group-color": tabGroup.color } as CSSProperties}
        >
          <button
            type="button"
            className="dock-document-tab-group-label"
            data-dock-no-drag="true"
            onClick={() => onDocumentGroupToggle?.(tabGroup)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDocumentGroupContextMenu?.(tabGroup, event.clientX, event.clientY);
            }}
            title={tabGroup.name}
          >
            <ChevronRight size={10} />
            <span>{tabGroup.name}</span>
            <small>{groupTabs.length}</small>
            {groupDirty ? <strong>*</strong> : null}
          </button>
          {!tabGroup.collapsed ? (
            <div className="dock-document-tab-group-tabs">
              {groupTabs.map((groupTab) => renderTabButton(groupTab))}
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div
      className={`dock-tab-bar ${isWritingGroup ? "dock-writing-tab-bar" : "dock-panel-tab-bar"}`}
      data-dock-drag-handle="group-header"
      onPointerDown={(event) => {
        if (!activeTab) return;
        startDragFromEvent(event, activeTab, "group-header");
      }}
      onContextMenu={(event) => {
        if (!onGroupContextMenu) return;
        if ((event.target as HTMLElement).closest("[data-dock-tab-id], button")) return;
        event.preventDefault();
        event.stopPropagation();
        onGroupContextMenu(group.id, event.clientX, event.clientY);
      }}
      title={activeTab ? `Drag ${activeTab.title}` : undefined}
    >
      <div className="dock-tab-strip">
        <div
          className="dock-document-tabs"
        >
          {isWritingGroup ? renderDocumentTabs() : documentTabs.map((tab) => renderTabButton(tab))}
        </div>
        {isWritingGroup ? (
          <button
            type="button"
            className="dock-tab-add"
            data-dock-no-drag="true"
            onClick={onOpenDocument}
            title="Open note"
          >
            <Plus size={10} />
          </button>
        ) : null}
        <div className="dock-panel-tabs">{panelTabs.map((tab) => renderTabButton(tab))}</div>
      </div>
    </div>
  );
}

const DROP_ZONE_LABELS: Record<DockDropPosition, string> = {
  center: "Dock as tab",
  left: "Split left",
  right: "Split right",
  top: "Split top",
  bottom: "Split bottom",
};

function DockDropOverlay({ target }: { target?: DockDropTarget }) {
  return (
    <div className="dock-drop-overlay" aria-hidden="true">
      {(["top", "right", "bottom", "left", "center"] as DockDropPosition[]).map((position) => (
        <div
          key={position}
          className={`dock-drop-zone dock-drop-${position} ${target?.position === position ? "is-target" : ""}`}
          data-label={DROP_ZONE_LABELS[position]}
        />
      ))}
    </div>
  );
}

function DockDragGhost({ dragState }: { dragState: DockDragState }) {
  return (
    <div className="dock-drag-ghost" style={{ transform: `translate(${dragState.x + 12}px, ${dragState.y + 10}px)` }}>
      <span>{dragState.item.title}</span>
    </div>
  );
}

function EmptyDockGroup({ groupId }: { groupId: string }) {
  if (groupId === "dock-documents") {
    return (
      <div className="dock-empty-group">
        <span>Writing sheet</span>
      </div>
    );
  }

  return (
    <div className="dock-empty-group">
      <span>No panel selected</span>
    </div>
  );
}

function useDockDragController({
  workspaceRef,
  onMoveTab,
}: {
  workspaceRef: RefObject<HTMLDivElement | null>;
  onMoveTab: DockWorkspaceProps["onMoveTab"];
}) {
  const [dragState, setDragState] = useState<DockDragState>();
  const latestDragState = useRef<DockDragState | undefined>(undefined);
  const isDragging = Boolean(dragState);

  useEffect(() => {
    latestDragState.current = dragState;
  }, [dragState]);

  const startDrag = useCallback((input: DockPointerDragInput) => {
    const nextState = {
      item: {
        tabId: input.tab.id,
        sourceGroupId: input.groupId,
        title: input.tab.title,
        handleKind: input.handleKind,
      },
      pointerId: input.pointerId,
      startX: input.startX,
      startY: input.startY,
      x: input.startX,
      y: input.startY,
      active: false,
    };
    latestDragState.current = nextState;
    setDragState(nextState);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function finishDrag() {
      const current = latestDragState.current;
      latestDragState.current = undefined;
      setDragState(undefined);
      if (!current?.active || !current.target) return;
      onMoveTab({
        tabId: current.item.tabId,
        sourceGroupId: current.item.sourceGroupId,
        targetGroupId: current.target.groupId,
        position: current.target.position,
        targetTabId: current.target.targetTabId,
      });
    }

    function cancelDrag() {
      latestDragState.current = undefined;
      setDragState(undefined);
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (event.pointerId !== latestDragState.current?.pointerId) return;
      event.preventDefault();
      setDragState((current) => {
        if (!current) return current;
        const distanceX = event.clientX - current.startX;
        const distanceY = event.clientY - current.startY;
        const active =
          current.active || Math.hypot(distanceX, distanceY) >= DOCK_DRAG_THRESHOLD;
        const nextState = {
          ...current,
          x: event.clientX,
          y: event.clientY,
          active,
          target: active
            ? getAllowedDockDropTarget(current.item, getDockDropTarget(workspaceRef.current, event.clientX, event.clientY))
            : undefined,
        };
        latestDragState.current = nextState;
        return nextState;
      });
    }

    function handlePointerUp(event: globalThis.PointerEvent) {
      if (event.pointerId !== latestDragState.current?.pointerId) return;
      event.preventDefault();
      finishDrag();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDragging, onMoveTab, workspaceRef]);

  return useMemo(() => ({ dragState, startDrag }), [dragState, startDrag]);
}

function getDockDropTarget(workspaceElement: HTMLDivElement | null, x: number, y: number): DockDropTarget | undefined {
  if (!workspaceElement) return undefined;
  const groups = [...workspaceElement.querySelectorAll<HTMLElement>("[data-dock-group-id]")];
  let smallestArea = Number.POSITIVE_INFINITY;
  let targetGroup: HTMLElement | undefined;

  for (const group of groups) {
    const rect = group.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    const area = rect.width * rect.height;
    if (area < smallestArea) {
      smallestArea = area;
      targetGroup = group;
    }
  }

  if (!targetGroup) return undefined;
  const rect = targetGroup.getBoundingClientRect();
  const position = getDropPosition(rect, x, y);
  const elementAtPoint = document.elementFromPoint?.(x, y) as HTMLElement | null | undefined;
  const tabElement = elementAtPoint?.closest<HTMLElement>("[data-dock-tab-id]") ?? null;
  const targetTabId =
    position === "center" && targetGroup.contains(tabElement) ? tabElement?.dataset.dockTabId : undefined;
  const groupId = targetGroup.dataset.dockGroupId;

  return groupId ? { groupId, position, targetTabId } : undefined;
}

function getDropPosition(rect: DOMRect, x: number, y: number): DockDropPosition {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const localX = (x - rect.left) / width;
  const localY = (y - rect.top) / height;

  if (localX <= DOCK_EDGE_ZONE_RATIO) return "left";
  if (localX >= 1 - DOCK_EDGE_ZONE_RATIO) return "right";
  if (localY <= DOCK_EDGE_ZONE_RATIO) return "top";
  if (localY >= 1 - DOCK_EDGE_ZONE_RATIO) return "bottom";
  return "center";
}

function getAllowedDockDropTarget(item: DraggedDockTab, target?: DockDropTarget): DockDropTarget | undefined {
  if (!target) return undefined;
  return isDockMoveAllowedAroundDocumentAnchor({
    tabId: item.tabId,
    sourceGroupId: item.sourceGroupId,
    targetGroupId: target.groupId,
    position: target.position,
    targetTabId: target.targetTabId,
  })
    ? target
    : undefined;
}
