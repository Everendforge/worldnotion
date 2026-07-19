import { Check, ChevronRight, FolderPlus, X } from "lucide-react";

export type WorldNotionOnboardingStep = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
};

export function UniverseBasicsCard({ onCreate, onOpen }: { onCreate: () => void; onOpen: () => void }) {
  return (
    <section className="universe-basics-card" aria-labelledby="universe-basics-title">
      <div className="universe-basics-card-icon" aria-hidden="true">
        <FolderPlus size={18} />
      </div>
      <div>
        <p className="eyebrow">Primeros pasos</p>
        <h3 id="universe-basics-title">Tu universo vive en una carpeta</h3>
        <p>
          Elige una carpeta local. Allí vivirán tus notas Markdown, carpetas, archivos
          <code>.everend</code> y las historias de PathBranching.
        </p>
        <div className="universe-basics-actions">
          <button type="button" className="primary-action" onClick={onCreate}>
            Crear universo
          </button>
          <button type="button" onClick={onOpen}>
            Abrir universo existente
          </button>
        </div>
      </div>
    </section>
  );
}

export function OnboardingGuide({
  steps,
  onDismiss,
  onRestart,
}: {
  steps: WorldNotionOnboardingStep[];
  onDismiss: () => void;
  onRestart: () => void;
}) {
  const activeIndex = steps.findIndex((step) => !step.complete);
  const completed = activeIndex === -1;
  const current = completed ? steps[steps.length - 1] : steps[activeIndex];

  if (!current) return null;

  return (
    <aside className="onboarding-guide" aria-label="WorldNotion onboarding guide">
      <header className="onboarding-guide-header">
        <div>
          <p className="eyebrow">Guía de WorldNotion</p>
          <strong>{completed ? "Fundamentos completados" : current.title}</strong>
        </div>
        <button type="button" className="onboarding-guide-close" onClick={onDismiss} aria-label="Cerrar guía">
          <X size={15} />
        </button>
      </header>
      <p className="onboarding-guide-description">
        {completed ? "Ya conoces la estructura básica de carpetas y notas." : current.description}
      </p>
      <ol className="onboarding-guide-steps">
        {steps.map((step, index) => (
          <li key={step.id} className={`${step.complete ? "complete" : ""} ${index === activeIndex ? "active" : ""}`}>
            <span className="onboarding-guide-step-icon" aria-hidden="true">
              {step.complete ? <Check size={12} /> : index + 1}
            </span>
            <span>{step.title}</span>
            {index === activeIndex ? <ChevronRight size={13} aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      {completed ? (
        <button type="button" className="onboarding-guide-restart" onClick={onRestart}>
          Repetir guía
        </button>
      ) : (
        <small className="onboarding-guide-progress">
          {steps.filter((step) => step.complete).length} de {steps.length} pasos completados
        </small>
      )}
    </aside>
  );
}
