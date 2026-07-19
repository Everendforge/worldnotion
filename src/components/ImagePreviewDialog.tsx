import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { VaultIndex } from "../domain";
import { useVaultImage } from "../utils/vaultImages";
import { pathName } from "../utils/pathUtils";
import "../App.css";
import { useWorldnotionUi } from "../i18n";

type ImagePreviewDialogProps = {
  index: VaultIndex;
  path: string;
  onClose: () => void;
};

/** A non-editable viewer for an image selected from the vault explorer. */
export function ImagePreviewDialog({ index, path, onClose }: ImagePreviewDialogProps) {
  const ui = useWorldnotionUi();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { url, error } = useVaultImage(index, path);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="modal-overlay image-preview-overlay" onClick={onClose}>
      <section
        className="modal-dialog image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ui.imagePreview.replace("{{name}}", pathName(path))}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="modal-header image-preview-header">
          <div>
            <h2>{pathName(path)}</h2>
            <p>{path}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="image-preview-close"
            aria-label={ui.closeImagePreview}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="image-preview-body">
          {url ? <img src={url} alt={pathName(path)} /> : null}
          {!url && !error ? <p className="muted">{ui.loadingImagePreview}</p> : null}
          {error ? (
            <p className="image-preview-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
