import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeVaultIndex } from "../test/fixtures";
import { ImagePreviewDialog } from "./ImagePreviewDialog";

vi.mock("../utils/vaultImages", () => ({
  useVaultImage: () => ({ url: "data:image/png;base64,AAAA", error: undefined }),
}));

describe("ImagePreviewDialog", () => {
  it("renders the selected vault image and its path", () => {
    render(
      <ImagePreviewDialog index={makeVaultIndex()} path="attachments/hero.png" onClose={vi.fn()} />,
    );

    expect(screen.getByRole("dialog", { name: /image preview: hero.png/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "hero.png" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
    expect(screen.getByText("attachments/hero.png")).toBeInTheDocument();
  });
});
