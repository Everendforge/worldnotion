import { StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export type ParagraphSpacingPosition = "before" | "after";

type ParagraphSpacingEffect = {
  position: number;
  spacing: ParagraphSpacingPosition;
};

type ParagraphSpacingEntry = {
  position: number;
  before: boolean;
  after: boolean;
};

export const paragraphSpacingEffect = StateEffect.define<ParagraphSpacingEffect>();

const paragraphSpacingField = StateField.define<ParagraphSpacingEntry[]>({
  create: () => [],
  update(entries, transaction) {
    const next = transaction.docChanged
      ? entries.map((entry) => ({
          ...entry,
          position: transaction.changes.mapPos(entry.position, 1),
        }))
      : entries.map((entry) => ({ ...entry }));

    for (const effect of transaction.effects) {
      if (!effect.is(paragraphSpacingEffect)) continue;

      const { position, spacing } = effect.value;
      let entry = next.find((candidate) => candidate.position === position);
      if (!entry) {
        entry = { position, before: false, after: false };
        next.push(entry);
      }
      entry[spacing] = !entry[spacing];
    }

    return next.filter((entry) => entry.before || entry.after);
  },
  provide: (field) =>
    EditorView.decorations.from(field, (entries) => {
      const decorations = entries.flatMap((entry) => [
        ...(entry.before
          ? [Decoration.line({ class: "cm-paragraph-space-before" }).range(entry.position)]
          : []),
        ...(entry.after
          ? [Decoration.line({ class: "cm-paragraph-space-after" }).range(entry.position)]
          : []),
      ]);
      return Decoration.set(decorations, true);
    }),
});

export function paragraphSpacingExtension() {
  return paragraphSpacingField;
}

export function paragraphLinePositions(doc: Text, position: number) {
  const selectedLine = doc.lineAt(position);
  if (!selectedLine.text.trim()) return undefined;

  let firstLine = selectedLine.number;
  while (firstLine > 1 && doc.line(firstLine - 1).text.trim()) firstLine -= 1;

  let lastLine = selectedLine.number;
  while (lastLine < doc.lines && doc.line(lastLine + 1).text.trim()) lastLine += 1;

  return {
    before: doc.line(firstLine).from,
    after: doc.line(lastLine).from,
  };
}
