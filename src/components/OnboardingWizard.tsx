import { useState } from "react";
import { ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";
import { PROPERTY_TEMPLATES, applyPropertyTemplate, type PropertyTemplate } from "../utils/propertyTemplates";
import type { TaxonomyConfig } from "../editorTypes";

type OnboardingWizardProps = {
  taxonomyConfig: TaxonomyConfig;
  onComplete: (config: TaxonomyConfig) => void;
  onSkip: () => void;
};

type WizardStep = "welcome" | "template-selection" | "confirmation";

export function OnboardingWizard({ taxonomyConfig, onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [selectedTemplate, setSelectedTemplate] = useState<PropertyTemplate | null>(null);

  const handleNext = () => {
    if (currentStep === "welcome") {
      setCurrentStep("template-selection");
    } else if (currentStep === "template-selection" && selectedTemplate) {
      setCurrentStep("confirmation");
    }
  };

  const handleBack = () => {
    if (currentStep === "template-selection") {
      setCurrentStep("welcome");
    } else if (currentStep === "confirmation") {
      setCurrentStep("template-selection");
    }
  };

  const handleComplete = () => {
    if (selectedTemplate) {
      const newConfig = applyPropertyTemplate(taxonomyConfig, selectedTemplate);
      onComplete(newConfig);
    } else {
      onComplete(taxonomyConfig);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={24} />
            <h2 className="text-2xl font-bold">Welcome to Worldnotion</h2>
          </div>
          <p className="mt-2 text-purple-100">Configure your property system</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 p-4 bg-gray-50 border-b border-gray-200">
          <div className={`flex items-center gap-2 ${currentStep === "welcome" ? "text-purple-600 font-semibold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "welcome" ? "bg-purple-600 text-white" : "bg-gray-300"}`}>
              1
            </div>
            <span className="hidden sm:inline">Welcome</span>
          </div>

          <div className="w-8 h-1 bg-gray-300"></div>

          <div className={`flex items-center gap-2 ${currentStep === "template-selection" ? "text-purple-600 font-semibold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "template-selection" || currentStep === "confirmation" ? "bg-purple-600 text-white" : "bg-gray-300"}`}>
              2
            </div>
            <span className="hidden sm:inline">Choose Template</span>
          </div>

          <div className="w-8 h-1 bg-gray-300"></div>

          <div className={`flex items-center gap-2 ${currentStep === "confirmation" ? "text-purple-600 font-semibold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "confirmation" ? "bg-purple-600 text-white" : "bg-gray-300"}`}>
              3
            </div>
            <span className="hidden sm:inline">Confirm</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === "welcome" && <WelcomeStep />}
          {currentStep === "template-selection" && (
            <TemplateSelectionStep
              selectedTemplate={selectedTemplate}
              onSelect={setSelectedTemplate}
            />
          )}
          {currentStep === "confirmation" && selectedTemplate && (
            <ConfirmationStep template={selectedTemplate} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:underline"
          >
            Skip for now
          </button>

          <div className="flex gap-2">
            {currentStep !== "welcome" && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}

            {currentStep === "confirmation" ? (
              <button
                type="button"
                onClick={handleComplete}
                className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                <Check size={16} />
                Complete Setup
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={currentStep === "template-selection" && !selectedTemplate}
                className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Welcome
function WelcomeStep() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-3">Let's set up your property system</h3>
        <p className="text-gray-600">
          Properties define the metadata you can add to your entities (characters, locations, items, etc.).
          A well-configured property system helps you organize and track your narrative universe effectively.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">What are properties?</h4>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex gap-2">
            <span className="text-blue-600">•</span>
            <span><strong>Base properties</strong>: Core fields like ID, name, type, status, and tags</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-600">•</span>
            <span><strong>Custom properties</strong>: Additional fields you define (e.g., priority, author, category)</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-600">•</span>
            <span><strong>Templates</strong>: Pre-configured sets of properties for common workflows</span>
          </li>
        </ul>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h4 className="font-semibold text-purple-900 mb-2">What happens next?</h4>
        <p className="text-sm text-purple-800">
          You'll choose a property template that matches your workflow. Don't worry—you can always customize
          properties later in the settings panel.
        </p>
      </div>
    </div>
  );
}

// Step 2: Template Selection
function TemplateSelectionStep({
  selectedTemplate,
  onSelect,
}: {
  selectedTemplate: PropertyTemplate | null;
  onSelect: (template: PropertyTemplate) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold mb-2">Choose a property template</h3>
        <p className="text-gray-600">
          Select a template that matches your workflow. Each template includes different base properties and custom fields.
        </p>
      </div>

      <div className="space-y-3">
        {PROPERTY_TEMPLATES.map((template) => (
          <div
            key={template.id}
            className={`border rounded-lg p-4 cursor-pointer transition ${
              selectedTemplate?.id === template.id
                ? "border-purple-500 bg-purple-50"
                : "border-gray-300 hover:border-purple-300 hover:bg-gray-50"
            }`}
            onClick={() => onSelect(template)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-lg">{template.label}</h4>
                  {selectedTemplate?.id === template.id && (
                    <div className="text-purple-600">
                      <Check size={20} />
                    </div>
                  )}
                </div>
                <p className="text-gray-600 mb-3">{template.description}</p>

                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Visible properties:</span>{" "}
                    <span className="text-gray-600">{template.visibleBaseProperties.join(", ")}</span>
                  </div>

                  {template.customFields.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Custom fields:</span>{" "}
                      <span className="text-gray-600">
                        {template.customFields.map((f) => f.label).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 3: Confirmation
function ConfirmationStep({ template }: { template: PropertyTemplate }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Review your selection</h3>
        <p className="text-gray-600">
          Here's what will be configured when you complete setup:
        </p>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="text-purple-600" size={24} />
          <h4 className="font-semibold text-lg text-purple-900">{template.label} Template</h4>
        </div>

        <div className="space-y-4">
          <div>
            <h5 className="font-medium text-purple-900 mb-2">Visible Base Properties</h5>
            <div className="flex flex-wrap gap-2">
              {template.visibleBaseProperties.map((prop) => (
                <span
                  key={prop}
                  className="px-3 py-1 bg-white border border-purple-300 rounded-full text-sm text-purple-800"
                >
                  {prop}
                </span>
              ))}
            </div>
          </div>

          {template.customFields.length > 0 && (
            <div>
              <h5 className="font-medium text-purple-900 mb-2">Custom Fields</h5>
              <div className="space-y-2">
                {template.customFields.map((field) => (
                  <div
                    key={field.id}
                    className="bg-white border border-purple-200 rounded p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-purple-900">{field.label}</span>
                      <span className="text-xs text-purple-600 uppercase bg-purple-100 px-2 py-1 rounded">
                        {field.type}
                      </span>
                    </div>
                    {field.description && (
                      <p className="text-sm text-purple-700 mt-1">{field.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> You can customize these properties at any time from the Taxonomy Editor.
          This template is just a starting point!
        </p>
      </div>
    </div>
  );
}
