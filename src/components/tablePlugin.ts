import { EditorState, Range, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { WritingMode } from "../editorTypes";
import { selectionTouches } from "./pluginUtils";

type TableAlignment = "left" | "center" | "right";

/** A cell's full segment between pipes; `text` is the trimmed content. */
export type TableCellSegment = { from: number; to: number; text: string };

type MarkdownTable = {
  from: number;
  to: number;
  header: TableCellSegment[];
  alignments: TableAlignment[];
  rows: TableCellSegment[][];
};

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isTableRow(line: string): boolean {
  return line.includes("|") && !TABLE_SEPARATOR.test(line);
}

/** Splits a table line into cell segments with their document ranges. */
export function lineCellSegments(lineText: string, lineFrom: number): TableCellSegment[] {
  const pipes: number[] = [];
  for (let i = 0; i < lineText.length; i += 1) {
    if (lineText[i] === "|" && lineText[i - 1] !== "\\") pipes.push(i);
  }
  if (!pipes.length) return [];

  const segment = (start: number, end: number): TableCellSegment => ({
    from: lineFrom + start,
    to: lineFrom + end,
    text: lineText.slice(start, end).trim(),
  });

  const segments: TableCellSegment[] = [];
  if (lineText.slice(0, pipes[0]).trim()) segments.push(segment(0, pipes[0]));
  for (let p = 0; p < pipes.length - 1; p += 1) {
    segments.push(segment(pipes[p] + 1, pipes[p + 1]));
  }
  const lastPipe = pipes[pipes.length - 1];
  if (lineText.slice(lastPipe + 1).trim()) segments.push(segment(lastPipe + 1, lineText.length));
  return segments;
}

function tableAlignment(cell: string): TableAlignment {
  const trimmed = cell.trim();
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
  if (trimmed.endsWith(":")) return "right";
  return "left";
}

export function tablesInDocument(state: EditorState): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  const { doc } = state;
  let lineNumber = 1;

  while (lineNumber < doc.lines) {
    const headerLine = doc.line(lineNumber);
    const separatorLine = doc.line(lineNumber + 1);
    if (!isTableRow(headerLine.text) || !TABLE_SEPARATOR.test(separatorLine.text)) {
      lineNumber += 1;
      continue;
    }

    const header = lineCellSegments(headerLine.text, headerLine.from);
    const alignmentCells = lineCellSegments(separatorLine.text, separatorLine.from);
    if (header.length !== alignmentCells.length) {
      lineNumber += 1;
      continue;
    }

    const rows: TableCellSegment[][] = [];
    let lastLine = separatorLine;
    let bodyLineNumber = lineNumber + 2;
    while (bodyLineNumber <= doc.lines) {
      const bodyLine = doc.line(bodyLineNumber);
      if (!isTableRow(bodyLine.text)) break;
      const cells = lineCellSegments(bodyLine.text, bodyLine.from);
      if (cells.length !== header.length) break;
      rows.push(cells);
      lastLine = bodyLine;
      bodyLineNumber += 1;
    }

    tables.push({
      from: headerLine.from,
      to: lastLine.to,
      header,
      alignments: alignmentCells.map((cell) => tableAlignment(cell.text)),
      rows,
    });
    lineNumber = bodyLineNumber;
  }

  return tables;
}

export function serializeMarkdownTable(
  header: string[],
  alignments: TableAlignment[],
  rows: string[][],
): string {
  const alignmentCell = (alignment: TableAlignment | undefined) =>
    alignment === "center" ? ":---:" : alignment === "right" ? "---:" : "---";
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(header),
    line(header.map((_, index) => alignmentCell(alignments[index]))),
    ...rows.map(line),
  ].join("\n");
}

/**
 * The cell a rebuild should focus after a committed edit. The widget is
 * re-created on every document change, so focus is handed across rebuilds by
 * table anchor + cell coordinates (header row is -1).
 */
let pendingTableFocus: { anchor: number; row: number; col: number } | undefined;

function focusCell(container: HTMLElement, row: number, col: number) {
  const cell = container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

class EditableTableWidget extends WidgetType {
  constructor(private readonly tableData: MarkdownTable) {
    super();
  }

  eq(other: EditableTableWidget) {
    return JSON.stringify(other.tableData) === JSON.stringify(this.tableData);
  }

  toDOM(view: EditorView): HTMLElement {
    const { tableData } = this;
    const container = document.createElement("div");
    container.className = "cm-table-widget cm-table-editable";

    const columnCount = tableData.header.length;
    const cellAt = (row: number, col: number): TableCellSegment | undefined =>
      row === -1 ? tableData.header[col] : tableData.rows[row]?.[col];

    const commit = (element: HTMLElement, segment: TableCellSegment): boolean => {
      if (element.dataset.committed === "true") return false;
      const next = (element.textContent ?? "").replace(/\n/g, " ").trim();
      if (next === segment.text) return false;
      element.dataset.committed = "true";
      view.dispatch({
        changes: { from: segment.from, to: segment.to, insert: ` ${next} ` },
        userEvent: "input",
      });
      return true;
    };

    const moveFocus = (
      element: HTMLElement,
      fromRow: number,
      fromCol: number,
      forward: boolean,
    ) => {
      let row = fromRow;
      let col = fromCol + (forward ? 1 : -1);
      if (col >= columnCount) {
        col = 0;
        row = fromRow === -1 ? 0 : fromRow + 1;
      } else if (col < 0) {
        col = columnCount - 1;
        row = fromRow === 0 ? -1 : fromRow - 1;
      }
      if (row < -1 || row >= tableData.rows.length) return;
      const segment = cellAt(fromRow, fromCol);
      const changed = segment ? commit(element, segment) : false;
      if (changed) {
        pendingTableFocus = { anchor: tableData.from, row, col };
      } else {
        focusCell(container, row, col);
      }
    };

    const moveFocusDown = (element: HTMLElement, fromRow: number, fromCol: number) => {
      const row = fromRow === -1 ? 0 : fromRow + 1;
      if (row >= tableData.rows.length) {
        const segment = cellAt(fromRow, fromCol);
        if (segment) commit(element, segment);
        return;
      }
      const segment = cellAt(fromRow, fromCol);
      const changed = segment ? commit(element, segment) : false;
      if (changed) {
        pendingTableFocus = { anchor: tableData.from, row, col: fromCol };
      } else {
        focusCell(container, row, fromCol);
      }
    };

    const buildCell = (
      tag: "th" | "td",
      segment: TableCellSegment,
      row: number,
      col: number,
    ): HTMLElement => {
      const cell = document.createElement(tag);
      cell.textContent = segment.text;
      cell.style.textAlign = this.tableData.alignments[col] ?? "left";
      cell.setAttribute("contenteditable", "true");
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute("aria-label", `Table cell row ${row + 2}, column ${col + 1}`);
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          moveFocus(cell, row, col, !event.shiftKey);
        } else if (event.key === "Enter") {
          event.preventDefault();
          moveFocusDown(cell, row, col);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cell.textContent = segment.text;
          cell.blur();
        }
      });
      cell.addEventListener("blur", () => {
        commit(cell, segment);
      });
      return cell;
    };

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    tableData.header.forEach((segment, col) => {
      headerRow.appendChild(buildCell("th", segment, -1, col));
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tableData.rows.forEach((rowSegments, row) => {
      const tableRow = document.createElement("tr");
      rowSegments.forEach((segment, col) => {
        tableRow.appendChild(buildCell("td", segment, row, col));
      });
      tbody.appendChild(tableRow);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    const replaceTable = (header: string[], alignments: TableAlignment[], rows: string[][]) => {
      view.dispatch({
        changes: {
          from: tableData.from,
          to: tableData.to,
          insert: serializeMarkdownTable(header, alignments, rows),
        },
        userEvent: "input",
      });
    };

    const headerTexts = tableData.header.map((segment) => segment.text);
    const rowTexts = tableData.rows.map((row) => row.map((segment) => segment.text));

    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.className = "cm-table-add cm-table-add-row";
    addRow.textContent = "+ Row";
    addRow.setAttribute("aria-label", "Add table row");
    addRow.addEventListener("mousedown", (event) => {
      event.preventDefault();
      pendingTableFocus = { anchor: tableData.from, row: rowTexts.length, col: 0 };
      replaceTable(headerTexts, tableData.alignments, [...rowTexts, headerTexts.map(() => "")]);
    });
    container.appendChild(addRow);

    const addColumn = document.createElement("button");
    addColumn.type = "button";
    addColumn.className = "cm-table-add cm-table-add-col";
    addColumn.textContent = "+ Col";
    addColumn.setAttribute("aria-label", "Add table column");
    addColumn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      pendingTableFocus = { anchor: tableData.from, row: -1, col: headerTexts.length };
      replaceTable(
        [...headerTexts, ""],
        [...tableData.alignments, "left"],
        rowTexts.map((row) => [...row, ""]),
      );
    });
    container.appendChild(addColumn);

    if (pendingTableFocus && pendingTableFocus.anchor === tableData.from) {
      const target = pendingTableFocus;
      pendingTableFocus = undefined;
      setTimeout(() => focusCell(container, target.row, target.col), 0);
    }

    return container;
  }

  ignoreEvent() {
    // The widget owns keyboard and mouse interaction: cells are edited in
    // place and committed back to the markdown source on blur/Tab/Enter.
    return true;
  }
}

function tableDecorations(state: EditorState, presentation: WritingMode): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const selection = state.selection.main;
  for (const tableData of tablesInDocument(state)) {
    if (
      presentation === "semi" &&
      selectionTouches(selection.from, selection.to, tableData.from, tableData.to)
    ) {
      continue;
    }
    decorations.push(
      Decoration.replace({
        block: true,
        widget: new EditableTableWidget(tableData),
      }).range(tableData.from, tableData.to),
    );
  }

  return Decoration.set(decorations, true);
}

/** Renders GFM tables as an in-place editable grid in Write mode. */
export function tablePlugin(presentation: WritingMode = "processed") {
  return StateField.define<DecorationSet>({
    create: (state) => tableDecorations(state, presentation),
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return tableDecorations(transaction.state, presentation);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
