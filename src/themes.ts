import type { ThemeId } from "./editorTypes";

export type ThemeFamily = "worldnotion" | "github" | "one" | "dracula" | "owl" | "material";
export type ThemeMode = "light" | "dark";

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  isDark: boolean;
  family: ThemeFamily;
  mode: ThemeMode;
};

export const THEMES: ThemeDefinition[] = [
  { id: "worldnotion-light", label: "WorldNotion Light", isDark: false, family: "worldnotion", mode: "light" },
  { id: "worldnotion-dark", label: "WorldNotion Dark", isDark: true, family: "worldnotion", mode: "dark" },
  { id: "github", label: "GitHub Light", isDark: false, family: "github", mode: "light" },
  { id: "github-dark", label: "GitHub Dark", isDark: true, family: "github", mode: "dark" },
  { id: "one-light-pro", label: "One Light Pro", isDark: false, family: "one", mode: "light" },
  { id: "one-dark-pro", label: "One Dark Pro", isDark: true, family: "one", mode: "dark" },
  { id: "dracula-light", label: "Dracula Light", isDark: false, family: "dracula", mode: "light" },
  { id: "dracula", label: "Dracula", isDark: true, family: "dracula", mode: "dark" },
  { id: "light-owl", label: "Light Owl", isDark: false, family: "owl", mode: "light" },
  { id: "night-owl", label: "Night Owl", isDark: true, family: "owl", mode: "dark" },
  { id: "material-lighter", label: "Material Lighter", isDark: false, family: "material", mode: "light" },
  { id: "material-palenight", label: "Material Palenight", isDark: true, family: "material", mode: "dark" },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);

const STYLE_FAMILY_BY_ID: Record<string, ThemeFamily> = {
  worldnotion: "worldnotion",
  github: "github",
  "one-dark-pro": "one",
  "one-light-pro": "one",
  dracula: "dracula",
  "night-owl": "owl",
  "light-owl": "owl",
  "material-palenight": "material",
  "material-lighter": "material",
};

export function normalizeThemeId(value: unknown): ThemeId {
  if (value === "light") return "worldnotion-light";
  if (value === "dark") return "worldnotion-dark";
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : "worldnotion-light";
}

export function themeById(themeId: ThemeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}

export function isDarkTheme(themeId: ThemeId) {
  return themeById(themeId).isDark;
}

export function themeMode(themeId: ThemeId): ThemeMode {
  return themeById(themeId).mode;
}

export function themeFamily(themeId: ThemeId): ThemeFamily {
  return themeById(themeId).family;
}

export function themeForFamilyAndMode(family: ThemeFamily, mode: ThemeMode): ThemeId {
  return THEMES.find((theme) => theme.family === family && theme.mode === mode)?.id ?? "worldnotion-light";
}

export function themeForStyleCommand(styleId: string, currentTheme: ThemeId): ThemeId {
  const family = STYLE_FAMILY_BY_ID[styleId] ?? themeFamily(currentTheme);
  return themeForFamilyAndMode(family, themeMode(currentTheme));
}

export function toggledThemeMode(themeId: ThemeId): ThemeId {
  const current = themeById(themeId);
  return themeForFamilyAndMode(current.family, current.mode === "dark" ? "light" : "dark");
}

export function selectionColorForTheme(themeId: ThemeId): { backgroundColor: string; opacity: string } {
  const theme = themeById(themeId);
  
  // Define theme-specific selection colors with improved visibility
  // Opacity increased from baseline to improve text selection visibility
  const colorMap: Record<ThemeFamily, Record<ThemeMode, { backgroundColor: string; opacity: string }>> = {
    worldnotion: {
      light: { backgroundColor: "#3f7f64", opacity: "0.35" },    // Green accent at 35% opacity (was 25%)
      dark: { backgroundColor: "#7cc7a2", opacity: "0.45" },     // Lighter green at 45% opacity (was 35%)
    },
    github: {
      light: { backgroundColor: "#0969da", opacity: "0.28" },    // GitHub blue (was 0.2%)
      dark: { backgroundColor: "#58a6ff", opacity: "0.38" },     // GitHub light blue (was 0.3%)
    },
    one: {
      light: { backgroundColor: "#4078f2", opacity: "0.28" },    // One light blue (was 0.2%)
      dark: { backgroundColor: "#61afef", opacity: "0.38" },     // One dark blue (was 0.3%)
    },
    dracula: {
      light: { backgroundColor: "#bd93f9", opacity: "0.28" },    // Dracula purple (was 0.2%)
      dark: { backgroundColor: "#bd93f9", opacity: "0.40" },     // Dracula purple (was 0.3%)
    },
    owl: {
      light: { backgroundColor: "#c41e3a", opacity: "0.25" },    // Owl red (was 0.15%)
      dark: { backgroundColor: "#7aa6da", opacity: "0.35" },     // Owl blue (was 0.25%)
    },
    material: {
      light: { backgroundColor: "#39adb5", opacity: "0.28" },    // Material teal (was 0.2%)
      dark: { backgroundColor: "#89ddff", opacity: "0.35" },     // Material light cyan (was 0.25%)
    },
  };
  
  return colorMap[theme.family][theme.mode];
}
