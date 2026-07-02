/**
 * Template management for property configurations.
 * Handles saving, loading, and listing property templates.
 */

import { PropertyDefinition } from "../editorTypes";

export interface PropertyTemplate {
  name: string;
  description?: string;
  definitions: PropertyDefinition[];
  version: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/**
 * Get the templates directory path for the user's system.
 * For now, returns a localStorage key prefix.
 * Future: could integrate with file system API or cloud storage.
 */
function getTemplateStorageKey(templateName: string): string {
  return `worldnotion-template:${templateName}`;
}

/**
 * Save a property template to local storage.
 */
export function savePropertyTemplate(template: PropertyTemplate): void {
  const storageKey = getTemplateStorageKey(template.name);
  
  try {
    const templateData = {
      ...template,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(templateData));
  } catch (error) {
    throw new Error(
      `Failed to save template "${template.name}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Load a property template from local storage.
 */
export function loadPropertyTemplate(templateName: string): PropertyTemplate | null {
  const storageKey = getTemplateStorageKey(templateName);
  
  try {
    const data = localStorage.getItem(storageKey);
    if (!data) return null;
    
    return JSON.parse(data) as PropertyTemplate;
  } catch (error) {
    console.error(`Failed to load template "${templateName}":`, error);
    return null;
  }
}

/**
 * List all saved property templates.
 */
export function listPropertyTemplates(): PropertyTemplate[] {
  const templates: PropertyTemplate[] = [];
  const prefix = "worldnotion-template:";
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            templates.push(JSON.parse(data) as PropertyTemplate);
          } catch (error) {
            console.warn(`Failed to parse template at key ${key}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to list templates:", error);
  }
  
  return templates.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Delete a property template.
 */
export function deletePropertyTemplate(templateName: string): boolean {
  const storageKey = getTemplateStorageKey(templateName);
  
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error(`Failed to delete template "${templateName}":`, error);
    return false;
  }
}

/**
 * Check if a template name already exists.
 */
export function templateExists(templateName: string): boolean {
  return loadPropertyTemplate(templateName) !== null;
}

/**
 * Create a new template from definitions.
 */
export function createPropertyTemplate(
  name: string,
  definitions: PropertyDefinition[],
  description?: string,
  tags?: string[]
): PropertyTemplate {
  const now = new Date().toISOString();
  
  return {
    name,
    description,
    definitions,
    version: "2.0",
    createdAt: now,
    updatedAt: now,
    tags,
  };
}

/**
 * Update an existing template.
 */
export function updatePropertyTemplate(
  templateName: string,
  updates: Partial<Omit<PropertyTemplate, "createdAt">>
): PropertyTemplate | null {
  const existing = loadPropertyTemplate(templateName);
  if (!existing) return null;
  
  const updated: PropertyTemplate = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  savePropertyTemplate(updated);
  return updated;
}

/**
 * Duplicate a template with a new name.
 */
export function duplicatePropertyTemplate(
  sourceName: string,
  newName: string
): PropertyTemplate | null {
  const source = loadPropertyTemplate(sourceName);
  if (!source) return null;
  
  if (templateExists(newName)) {
    throw new Error(`Template "${newName}" already exists`);
  }
  
  const duplicate = createPropertyTemplate(
    newName,
    JSON.parse(JSON.stringify(source.definitions)), // Deep copy
    `${source.description || ""} (copy)`,
    source.tags
  );
  
  savePropertyTemplate(duplicate);
  return duplicate;
}

/**
 * Export a template as JSON string (for sharing/backup).
 */
export function exportTemplateAsJSON(templateName: string): string | null {
  const template = loadPropertyTemplate(templateName);
  if (!template) return null;
  
  return JSON.stringify(template, null, 2);
}

/**
 * Import a template from JSON string.
 */
export function importTemplateFromJSON(jsonString: string): PropertyTemplate | null {
  try {
    const template = JSON.parse(jsonString) as PropertyTemplate;
    
    // Validate structure
    if (!template.name || !Array.isArray(template.definitions)) {
      throw new Error("Invalid template structure");
    }
    
    // Check if name already exists
    if (templateExists(template.name)) {
      // Append suffix to make it unique
      let counter = 1;
      let newName = `${template.name} (${counter})`;
      while (templateExists(newName)) {
        counter++;
        newName = `${template.name} (${counter})`;
      }
      template.name = newName;
    }
    
    savePropertyTemplate(template);
    return template;
  } catch (error) {
    console.error("Failed to import template:", error);
    return null;
  }
}

/**
 * Search templates by name or description.
 */
export function searchPropertyTemplates(query: string): PropertyTemplate[] {
  const templates = listPropertyTemplates();
  const lowerQuery = query.toLowerCase();
  
  return templates.filter((template) => {
    const nameMatch = template.name.toLowerCase().includes(lowerQuery);
    const descMatch = template.description?.toLowerCase().includes(lowerQuery) ?? false;
    const tagsMatch = template.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)) ?? false;
    
    return nameMatch || descMatch || tagsMatch;
  });
}

/**
 * Get template statistics.
 */
export function getTemplateStats(): {
  totalCount: number;
  totalDefinitions: number;
  newestTemplate?: string;
  oldestTemplate?: string;
} {
  const templates = listPropertyTemplates();
  let totalDefinitions = 0;
  
  templates.forEach((template) => {
    totalDefinitions += template.definitions.length;
  });
  
  const sorted = [...templates].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  return {
    totalCount: templates.length,
    totalDefinitions,
    newestTemplate: templates[0]?.name,
    oldestTemplate: sorted[0]?.name,
  };
}

/**
 * Reset all templates (clear local storage).
 */
export function clearAllTemplates(): boolean {
  try {
    const keysToRemove: string[] = [];
    const prefix = "worldnotion-template:";
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return true;
  } catch (error) {
    console.error("Failed to clear templates:", error);
    return false;
  }
}
