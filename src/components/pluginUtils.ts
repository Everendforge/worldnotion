import { Range } from "@codemirror/state";
import { Decoration, ViewUpdate } from "@codemirror/view";

/**
 * Determines if an update involves structural changes (document or viewport).
 * Selection-only changes return false to avoid unnecessary decoration recalculation.
 *
 * @param update - The editor update
 * @returns true if docChanged or viewportChanged, false otherwise
 */
export function isStructuralChange(update: ViewUpdate): boolean {
  return update.docChanged || update.viewportChanged;
}

/**
 * Determines if a cursor/selection position touches a given range.
 * Used to detect if user is actively editing inside a syntax element.
 *
 * @param selectionFrom - Selection start position
 * @param selectionTo - Selection end position
 * @param from - Range start
 * @param to - Range end
 * @returns true if cursor/selection overlaps with range
 */
export function selectionTouches(
  selectionFrom: number,
  selectionTo: number,
  from: number,
  to: number,
): boolean {
  if (selectionFrom === selectionTo) {
    // The left edge is editable, but the right edge must behave like
    // plain text after the token. Otherwise hidden syntax attracts clicks.
    return selectionFrom >= from && selectionFrom < to;
  }
  // Selection range: check for real overlap, not adjacency.
  return selectionFrom < to && selectionTo > from;
}

/**
 * Creates a mark decoration with the given class.
 * Returns null if from >= to to prevent invalid ranges.
 *
 * @param from - Start position
 * @param to - End position
 * @param className - CSS class to apply
 * @returns Range<Decoration> or null if invalid
 */
export function marker(from: number, to: number, className: string): Range<Decoration> | null {
  if (from >= to) return null;
  return Decoration.mark({ class: className }).range(from, to);
}

/**
 * Creates a syntax marker that shows/hides based on context.
 * When editing (cursor in marker), shows with "muted" class.
 * When not editing, hides with "hidden" class.
 *
 * @param from - Start position
 * @param to - End position
 * @param isActive - Whether cursor is in this element (true = show muted, false = hide)
 * @returns Range<Decoration> or null if invalid
 */
export function syntaxMarker(
  from: number,
  to: number,
  isActive: boolean,
): Range<Decoration> | null {
  if (from >= to) return null;
  if (!isActive) {
    return Decoration.replace({
      inclusive: false,
      inclusiveStart: false,
      inclusiveEnd: false,
    }).range(from, to);
  }
  return Decoration.mark({ class: "cm-markdown-syntax-muted" }).range(from, to);
}

/**
 * Creates a decoration for hiding syntax characters (brackets, pipes, etc.)
 * while preserving the actual content. Hidden elements are not selectable or clickable.
 *
 * @param from - Start position
 * @param to - End position
 * @returns Range<Decoration> or null if invalid
 */
export function createSyntaxHiddenDecoration(from: number, to: number): Range<Decoration> | null {
  if (from >= to) return null;
  return Decoration.replace({
    inclusive: false,
    inclusiveStart: false,
    inclusiveEnd: false,
    attributes: {
      style: "pointer-events: none; user-select: none;",
      "aria-hidden": "true",
    },
  }).range(from, to);
}

/**
 * Creates a mark decoration with optional attributes and classes.
 * Useful for semantic styling (wikilinks, footnotes, etc.)
 *
 * @param from - Start position
 * @param to - End position
 * @param className - CSS class to apply
 * @param attributes - Optional attributes (data-*, aria-*, etc.)
 * @param inclusive - Whether decoration is inclusive (default false)
 * @returns Range<Decoration> or null if invalid
 */
export function createStyledDecoration(
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>,
  inclusive = false,
): Range<Decoration> | null {
  if (from >= to) return null;
  return Decoration.mark({
    class: className,
    attributes,
    inclusive,
  }).range(from, to);
}

/**
 * Limits a regex match array to prevent processing too many matches.
 * Useful for preventing performance issues on very large documents.
 *
 * @param matches - Array of regex matches
 * @param limit - Maximum number of matches to return (default 50)
 * @returns Limited matches array
 */
export function limitMatches<T>(matches: T[], limit = 50): T[] {
  return matches.slice(0, limit);
}

/**
 * Checks if a change range is within visible ranges.
 * Used to skip processing of off-screen content.
 *
 * @param changedFrom - Change start position
 * @param changedTo - Change end position
 * @param visibleRanges - Array of visible ranges from editor
 * @returns true if change overlaps with any visible range
 */
export function isChangeInVisibleRange(
  changedFrom: number,
  changedTo: number,
  visibleRanges: ReadonlyArray<{ from: number; to: number }>,
): boolean {
  return visibleRanges.some((range) => changedFrom <= range.to && changedTo >= range.from);
}
