import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createVariantContentPlugin } from "./variantContentPlugin";

const documentText = [
  "Shared",
  "",
  '<!-- everend:variant id="base" -->',
  "Base-only prose",
  "<!-- /everend:variant -->",
  "",
  '<!-- everend:variant id="alt" -->',
  "Alternate-only prose",
  "<!-- /everend:variant -->",
].join("\n");

function rangesFor(activeVariantId: string) {
  const field = createVariantContentPlugin(activeVariantId);
  const state = EditorState.create({ doc: documentText, extensions: field });
  const ranges: Array<{ from: number; to: number }> = [];
  state.field(field).between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to });
  });
  return ranges;
}

describe("variant content decorations", () => {
  it("renders the base section when the base variant is active", () => {
    const ranges = rangesFor("base");
    const baseOpening = documentText.indexOf('<!-- everend:variant id="base" -->');
    const altOpening = documentText.indexOf('<!-- everend:variant id="alt" -->');

    expect(ranges.some(({ from }) => from === baseOpening)).toBe(true);
    expect(ranges.some(({ from }) => from === altOpening)).toBe(true);
  });

  it("hides the base section when another variant is active", () => {
    const ranges = rangesFor("alt");
    const baseOpening = documentText.indexOf('<!-- everend:variant id="base" -->');
    const baseClose = documentText.indexOf("<!-- /everend:variant -->", baseOpening);

    expect(ranges.some(({ from, to }) => from === baseOpening && to > baseClose)).toBe(true);
  });

  it("rejects changes in inactive variants and markers but allows active prose", () => {
    const field = createVariantContentPlugin("alt");
    let state = EditorState.create({ doc: documentText, extensions: field });
    const baseText = documentText.indexOf("Base-only prose");
    state = state.update({ changes: { from: baseText, to: baseText + 4, insert: "Gone" } }).state;
    expect(state.doc.toString()).toBe(documentText);

    const altText = documentText.indexOf("Alternate-only prose");
    state = state.update({ changes: { from: altText, to: altText + 9, insert: "Changed" } }).state;
    expect(state.doc.toString()).toContain("Changed-only prose");

    const altMarker = state.doc.toString().indexOf('<!-- everend:variant id="alt" -->');
    const beforeMarkerDelete = state.doc.toString();
    state = state.update({ changes: { from: altMarker, to: altMarker + 4 } }).state;
    expect(state.doc.toString()).toBe(beforeMarkerDelete);
  });
});
