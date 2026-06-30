import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomFieldDefinition } from "../editorTypes";
import { PropertyFieldRenderer } from "./PropertyFieldRenderer";

describe("PropertyFieldRenderer", () => {
  it("renders select fields with the WorldNotion control class", () => {
    const property: CustomFieldDefinition = {
      id: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "hero", label: "Hero" },
        { value: "mentor", label: "Mentor" },
      ],
    };

    render(<PropertyFieldRenderer property={property} value="hero" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox").className).toContain("property-field-control");
  });
});
