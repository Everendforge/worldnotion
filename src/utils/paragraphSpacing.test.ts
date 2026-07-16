import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { paragraphLinePositions } from "./paragraphSpacing";

describe("paragraphLinePositions", () => {
  it("finds the first and last line of a paragraph", () => {
    const state = EditorState.create({ doc: "First line\ncontinued\n\nNext paragraph" });

    expect(paragraphLinePositions(state.doc, state.doc.line(2).from)).toEqual({
      before: state.doc.line(1).from,
      after: state.doc.line(2).from,
    });
  });

  it("ignores blank lines", () => {
    const state = EditorState.create({ doc: "First paragraph\n\nSecond paragraph" });

    expect(paragraphLinePositions(state.doc, state.doc.line(2).from)).toBeUndefined();
  });
});
