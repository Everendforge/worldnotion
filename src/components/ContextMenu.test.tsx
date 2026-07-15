import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

function renderFolderMenu(hasFolderDescription: boolean) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(
    <ContextMenu
      x={20}
      y={20}
      targetPath="World/Characters"
      targetKind="folder"
      templates={[]}
      hasFolderDescription={hasFolderDescription}
      onAction={onAction}
      onClose={onClose}
    />,
  );
  return { onAction, onClose };
}

describe("ContextMenu folder notes", () => {
  it("offers editing and deleting when the folder note exists", () => {
    const { onAction } = renderFolderMenu(true);

    expect(screen.getByText("Edit Folder Note")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Folder Note" }));

    expect(onAction).toHaveBeenCalledWith(
      "deleteFolderDescription",
      "World/Characters",
      "folder",
      undefined,
    );
  });

  it("offers creation without a destructive action when no folder note exists", () => {
    renderFolderMenu(false);

    expect(screen.getByText("Create Folder Note")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete Folder Note" })).toBeNull();
  });
});

describe("ContextMenu image actions", () => {
  it("offers a preview action for image files", () => {
    const onAction = vi.fn();
    render(
      <ContextMenu
        x={20}
        y={20}
        targetPath="attachments/hero.png"
        targetKind="file"
        templates={[]}
        isImage
        onAction={onAction}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(onAction).toHaveBeenCalledWith("preview", "attachments/hero.png", "file", undefined);
  });
});
