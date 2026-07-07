import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InputDialog } from "./InputDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { TemplateDialog } from "./TemplateDialog";
import { DialogProvider } from "./DialogProvider";

describe("accesibilidad de modales", () => {
  it("InputDialog expone role dialog y cierra con Escape", () => {
    const onCancel = vi.fn();
    render(
      <InputDialog
        isOpen
        title="Enter page name:"
        onConfirm={async () => {}}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Enter page name:" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("UnsavedChangesDialog enfoca Guardar, expone alertdialog y cierra con Escape", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        isOpen
        fileName="Mara.md"
        onDiscard={vi.fn()}
        onSave={async () => {}}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Cambios sin guardar" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Guardar" }));

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("UnsavedChangesDialog ignora Escape mientras guarda", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        isOpen
        isSaving
        fileName="Mara.md"
        onDiscard={vi.fn()}
        onSave={async () => {}}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("TemplateDialog expone role dialog y cierra con Escape", () => {
    const onClose = vi.fn();
    render(
      <DialogProvider>
        <TemplateDialog currentProperties={[]} onLoadTemplate={vi.fn()} onClose={onClose} />
      </DialogProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: "Property Templates" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
