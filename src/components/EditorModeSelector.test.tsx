import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorModeSelector } from "./EditorModeSelector";

const labels = {
  writing: "Writing",
  processed: "Processed",
  semi: "Semi-processed",
  source: "Source",
};

describe("EditorModeSelector", () => {
  it("selects a Writing presentation and keeps Source adjacent", () => {
    const onWritingModeChange = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <EditorModeSelector
        mode="write"
        writingMode="processed"
        labels={labels}
        onWritingModeChange={onWritingModeChange}
        onOpenWriting={vi.fn()}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Writing: Processed" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Semi-processed" }));
    expect(onWritingModeChange).toHaveBeenCalledWith("semi");

    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(onOpenSource).toHaveBeenCalledOnce();
  });

  it("dismisses the keyboard-accessible menu with Escape", () => {
    render(
      <EditorModeSelector
        mode="source"
        writingMode="semi"
        labels={labels}
        onWritingModeChange={vi.fn()}
        onOpenWriting={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Writing: Semi-processed" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow navigation and restores focus after selection", async () => {
    const onWritingModeChange = vi.fn();
    render(
      <EditorModeSelector
        mode="write"
        writingMode="processed"
        labels={labels}
        onWritingModeChange={onWritingModeChange}
        onOpenWriting={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Writing: Processed" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const processed = screen.getByRole("menuitemradio", { name: "Processed" });
    const semi = screen.getByRole("menuitemradio", { name: "Semi-processed" });
    await waitFor(() => expect(processed).toHaveFocus());
    fireEvent.keyDown(processed, { key: "ArrowDown" });
    expect(semi).toHaveFocus();
    fireEvent.click(semi);
    expect(onWritingModeChange).toHaveBeenCalledWith("semi");
  });
});
