use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::menu::{
    Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    relative_path: String,
    absolute_path: String,
    content: String,
    modified_ms: Option<u128>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultReadError {
    relative_path: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultReadResult {
    root_path: String,
    files: Vec<VaultFile>,
    directories: Vec<String>,
    errors: Vec<VaultReadError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    ok: bool,
    path: String,
    modified_ms: Option<u128>,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemeManifest {
    name: String,
    relative_path: String,
    absolute_path: String,
    content: String,
    kind: String,
}

fn menu_item(
    app: &tauri::AppHandle,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let style_menu = Submenu::with_items(
        app,
        "Style",
        true,
        &[
            &menu_item(app, "wn:window:style:github", "GitHub", None)?,
            &menu_item(app, "wn:window:style:one-dark-pro", "One Dark Pro", None)?,
            &menu_item(app, "wn:window:style:dracula", "Dracula", None)?,
            &menu_item(app, "wn:window:style:night-owl", "Night Owl", None)?,
            &menu_item(
                app,
                "wn:window:style:material-palenight",
                "Material Palenight",
                None,
            )?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &menu_item(app, "wn:file:new-note", "New Note", Some("CmdOrCtrl+N"))?,
            &menu_item(
                app,
                "wn:file:new-folder",
                "New Folder",
                Some("CmdOrCtrl+Shift+N"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(
                app,
                "wn:file:open-universe",
                "Open Universe...",
                Some("CmdOrCtrl+O"),
            )?,
            &menu_item(app, "wn:file:open-recent", "Open Recent", None)?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "wn:file:save", "Save", Some("CmdOrCtrl+S"))?,
            &menu_item(app, "wn:file:reveal-universe", "Reveal Universe", None)?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "wn:file:close-tab", "Close Tab", Some("CmdOrCtrl+W"))?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "wn:edit:find", "Find", Some("CmdOrCtrl+F"))?,
            &menu_item(app, "wn:edit:replace", "Find and Replace", Some("CmdOrCtrl+H"))?,
            &menu_item(app, "wn:edit:find-next", "Find Next", Some("F3"))?,
            &menu_item(app, "wn:edit:find-previous", "Find Previous", Some("Shift+F3"))?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "wn:edit:bold", "Bold", Some("CmdOrCtrl+B"))?,
            &menu_item(app, "wn:edit:italic", "Italic", Some("CmdOrCtrl+I"))?,
            &menu_item(app, "wn:edit:link", "Insert Link", Some("CmdOrCtrl+K"))?,
            &menu_item(
                app,
                "wn:edit:wikilink",
                "Insert Wikilink",
                Some("CmdOrCtrl+Shift+K"),
            )?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &menu_item(
                app,
                "wn:view:toggle-sidebar",
                "Toggle Sidebar",
                Some("CmdOrCtrl+\\"),
            )?,
            &menu_item(
                app,
                "wn:view:toggle-inspector",
                "Toggle Inspector",
                Some("CmdOrCtrl+Shift+\\"),
            )?,
            &menu_item(
                app,
                "wn:view:toggle-light-dark",
                "Toggle Light/Dark",
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(
                app,
                "wn:view:command-palette",
                "Command Palette",
                Some("CmdOrCtrl+P"),
            )?,
            &menu_item(
                app,
                "wn:view:quick-switcher",
                "Quick Switcher",
                Some("CmdOrCtrl+Alt+O"),
            )?,
            &menu_item(
                app,
                "wn:view:toggle-outline",
                "Toggle Outline",
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &menu_item(app, "wn:view:reload", "Reload Window", Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "wn:view:zoom-in", "Zoom In", Some("CmdOrCtrl+="))?,
            &menu_item(app, "wn:view:zoom-out", "Zoom Out", Some("CmdOrCtrl+-"))?,
            &menu_item(app, "wn:view:zoom-reset", "Reset Zoom", Some("CmdOrCtrl+0"))?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &style_menu,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[
            &menu_item(app, "wn:help:about", "About WorldNotion", None)?,
            &menu_item(
                app,
                "wn:help:open-project-folder",
                "Open Project Folder",
                None,
            )?,
            &menu_item(app, "wn:help:docs", "Documentation", None)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

fn modified_ms(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    if relative_path.trim().is_empty() {
        return Ok(PathBuf::new());
    }
    let path = PathBuf::from(relative_path);
    // `C:/x` is not absolute on Unix, so also reject drive-letter prefixes explicitly.
    if path.is_absolute()
        || relative_path.contains("..")
        || relative_path.contains('\\')
        || relative_path.contains(':')
    {
        return Err("Path must be a safe relative path inside the vault.".to_string());
    }
    Ok(path)
}

fn sanitize_segment(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || trimmed.starts_with('.')
    {
        return Err(
            "Name must be a non-empty path segment without slashes, dots, or traversal."
                .to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn escape_json(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

fn escape_yaml_double_quoted(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn write_text_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, content).map_err(|error| error.to_string())
}

fn ensure_inside(root: &Path, path: &Path) -> Result<(), String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("Could not resolve vault path: {error}"))?;
    let candidate = if path.exists() {
        path.canonicalize()
            .map_err(|error| format!("Could not resolve path: {error}"))?
    } else {
        path.parent()
            .unwrap_or(path)
            .canonicalize()
            .map_err(|error| format!("Could not resolve parent path: {error}"))?
    };

    if candidate.starts_with(root) {
        Ok(())
    } else {
        Err("Resolved path is outside the vault.".to_string())
    }
}

fn resolve_vault_path(vault_path: &str, relative_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = PathBuf::from(vault_path);
    let relative = normalize_relative_path(relative_path)?;
    let path = root.join(relative);
    ensure_inside(&root, &path)?;
    Ok((root, path))
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn duplicate_target(path: &Path, target_name: Option<String>) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Path has no parent directory.".to_string())?;

    if let Some(name) = target_name {
        return Ok(parent.join(sanitize_segment(&name)?));
    }

    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "Copy".to_string());
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_string());

    for index in 1..1000 {
        let candidate_name = if let Some(extension) = &extension {
            format!("{stem} copy {index}.{extension}")
        } else {
            format!("{stem} copy {index}")
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not find an available duplicate name.".to_string())
}

fn reveal_in_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .status()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        Command::new("xdg-open")
            .arg(target)
            .status()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn open_in_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn move_to_system_trash(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Finder\" to delete POSIX file \"{}\"",
            path.to_string_lossy().replace('"', "\\\"")
        );
        let status = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Could not move item to Trash.".to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        let method = if path.is_dir() {
            "DeleteDirectory"
        } else {
            "DeleteFile"
        };
        let script = format!(
            "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::{method}('{}','OnlyErrorDialogs','SendToRecycleBin')",
            path.to_string_lossy().replace('\'', "''")
        );
        let status = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(script)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Could not move item to Recycle Bin.".to_string())
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("gio")
            .arg("trash")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Could not move item to Trash.".to_string())
        }
    }
}

fn write_file_checked(
    path: &Path,
    content: &str,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    if path.is_dir() {
        return Err("Cannot write file content to a directory.".to_string());
    }

    if let Some(expected) = expected_modified_ms {
        if let Some(current) = modified_ms(path) {
            if current != expected {
                return Ok(WriteResult {
                    ok: false,
                    path: path.to_string_lossy().to_string(),
                    modified_ms: Some(current),
                    message: Some("File changed externally. Reload before saving.".to_string()),
                });
            }
        }
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Path has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let mut file = fs::File::create(path).map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;

    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(path),
        message: None,
    })
}

fn should_read_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md")
                || extension.eq_ignore_ascii_case("yaml")
                || extension.eq_ignore_ascii_case("json")
        })
        .unwrap_or(false)
}

fn walk_vault(
    root: &Path,
    current: &Path,
    files: &mut Vec<VaultFile>,
    directories: &mut Vec<String>,
    errors: &mut Vec<VaultReadError>,
) {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(error) => {
            let relative_path = current
                .strip_prefix(root)
                .unwrap_or(current)
                .to_string_lossy()
                .replace('\\', "/");
            errors.push(VaultReadError {
                relative_path,
                message: error.to_string(),
            });
            return;
        }
    };

    for entry in entries {
        match entry {
            Ok(entry) => {
                let path = entry.path();
                let file_name = entry.file_name();
                if file_name.to_string_lossy().starts_with('.') && file_name != ".everend" {
                    continue;
                }

                if path.is_dir() {
                    let relative_path = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    if !relative_path.is_empty() {
                        directories.push(relative_path);
                    }
                    walk_vault(root, &path, files, directories, errors);
                } else if should_read_file(&path) {
                    let relative_path = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");

                    match fs::read_to_string(&path) {
                        Ok(content) => files.push(VaultFile {
                            relative_path,
                            absolute_path: path.to_string_lossy().to_string(),
                            content,
                            modified_ms: modified_ms(&path),
                        }),
                        Err(error) => errors.push(VaultReadError {
                            relative_path,
                            message: error.to_string(),
                        }),
                    }
                }
            }
            Err(error) => errors.push(VaultReadError {
                relative_path: current
                    .strip_prefix(root)
                    .unwrap_or(current)
                    .to_string_lossy()
                    .replace('\\', "/"),
                message: error.to_string(),
            }),
        }
    }
}

fn read_vault(root: PathBuf) -> Result<VaultReadResult, String> {
    if !root.exists() {
        return Err(format!("Vault path does not exist: {}", root.display()));
    }

    if !root.is_dir() {
        return Err(format!("Vault path is not a directory: {}", root.display()));
    }

    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut errors = Vec::new();
    walk_vault(&root, &root, &mut files, &mut directories, &mut errors);
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    directories.sort();

    Ok(VaultReadResult {
        root_path: root.to_string_lossy().to_string(),
        files,
        directories,
        errors,
    })
}

#[tauri::command]
async fn open_vault_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.to_string()))
}

#[tauri::command]
fn index_vault(path: String) -> Result<VaultReadResult, String> {
    read_vault(PathBuf::from(path))
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

#[tauri::command]
fn read_file(path: String) -> Result<VaultFile, String> {
    let path = PathBuf::from(path);
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(VaultFile {
        relative_path: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        absolute_path: path.to_string_lossy().to_string(),
        content,
        modified_ms: modified_ms(&path),
    })
}

/// Maximum size for binary reads exposed to the webview (image previews).
const MAX_BINARY_READ_BYTES: u64 = 10 * 1024 * 1024;

#[tauri::command]
fn read_file_base64(vault_path: String, relative_path: String) -> Result<String, String> {
    let (_root, path) = resolve_vault_path(&vault_path, &relative_path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Path is not a file.".to_string());
    }
    if metadata.len() > MAX_BINARY_READ_BYTES {
        return Err("File is too large to preview (limit 10 MB).".to_string());
    }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn create_universe(vault_path: String, name: String) -> Result<WriteResult, String> {
    let root = PathBuf::from(vault_path);
    let segment = sanitize_segment(&name)?;
    let path = root.join(&segment);
    ensure_inside(&root, &path)?;

    if path.exists() {
        let mut entries = fs::read_dir(&path).map_err(|error| error.to_string())?;
        if entries.next().is_some() {
            return Ok(WriteResult {
                ok: false,
                path: path.to_string_lossy().to_string(),
                modified_ms: modified_ms(&path),
                message: Some("Universe folder already exists and is not empty.".to_string()),
            });
        }
    }

    fs::create_dir_all(&path).map_err(|error| error.to_string())?;

    let universe_slug = {
        let slug = slugify(&segment);
        if slug.is_empty() {
            "universe".to_string()
        } else {
            slug
        }
    };
    let escaped_name = escape_yaml_double_quoted(&segment);
    let root_note = format!(
        "---\nid: {universe_slug}\ntype: universe\nname: \"{escaped_name}\"\nstatus: draft\ntags: []\naliases: []\n---\n\n# {segment}\n\nStart shaping this universe here.\n\n- [[First Concept]]\n"
    );
    let profile = format!(
        "{{\n  \"name\": \"{}\",\n  \"icon\": {{\n    \"type\": \"preset\",\n    \"value\": \"book\"\n  }}\n}}\n",
        escape_json(&segment)
    );
    let taxonomy = "specVersion: \"0.1\"\ntypes:\n  universe:\n    label: Universe\n    description: Top-level world or project folder opened by WorldNotion.\n  concept:\n    label: Concept\n    description: Flexible note for lore, ideas, rules, or planning.\n    properties:\n      related:\n        type: entityRefList\n  character:\n    label: Character\n    description: Person, creature, or actor in the universe.\n  location:\n    label: Location\n    description: Place, region, settlement, room, or landmark.\n  item:\n    label: Item\n    description: Portable object, relic, tool, artifact, or inventory-relevant entity.\n";
    let concept_template = "---\nid: {{id}}\ntype: concept\nname: \"{{name}}\"\nstatus: {{status}}\ntags: []\naliases: []\n---\n\n# {{name}}\n\n";

    write_text_if_missing(&path.join(".everend").join("universe.json"), &profile)?;
    write_text_if_missing(&path.join(".everend").join("taxonomy.yaml"), taxonomy)?;
    write_text_if_missing(
        &path.join(".everend").join("templates").join("concept.md"),
        concept_template,
    )?;
    write_text_if_missing(&path.join(format!("{segment}.md")), &root_note)?;

    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(&path),
        message: None,
    })
}

#[tauri::command]
fn create_folder(vault_path: String, relative_path: String) -> Result<WriteResult, String> {
    let root = PathBuf::from(vault_path);
    let relative = normalize_relative_path(&relative_path)?;
    let path = root.join(relative);
    ensure_inside(&root, &path)?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(&path),
        message: None,
    })
}

#[tauri::command]
fn create_entity(
    vault_path: String,
    universe_path: String,
    folder_path: String,
    entity_type: String,
    name: String,
) -> Result<WriteResult, String> {
    let root = PathBuf::from(&vault_path);
    let universe = normalize_relative_path(&universe_path)?;
    let folder = if folder_path.trim().is_empty() {
        PathBuf::new()
    } else {
        normalize_relative_path(&folder_path)?
    };
    let safe_type = sanitize_segment(&entity_type)?;
    let safe_name = name.trim();
    if safe_name.is_empty() {
        return Err("Entity name is required.".to_string());
    }

    let slug = slugify(safe_name);
    if slug.is_empty() {
        return Err("Entity name must contain at least one alphanumeric character.".to_string());
    }

    let target_dir = root.join(universe).join(folder);
    let path = target_dir.join(format!("{slug}.md"));
    ensure_inside(&root, &path)?;
    if path.exists() {
        return Ok(WriteResult {
            ok: false,
            path: path.to_string_lossy().to_string(),
            modified_ms: modified_ms(&path),
            message: Some("Entity file already exists.".to_string()),
        });
    }

    let template_path = root
        .join(".everend")
        .join("templates")
        .join(format!("{safe_type}.md"));
    let default_id = slug.clone();
    let content = if template_path.exists() {
        fs::read_to_string(template_path)
            .map_err(|error| error.to_string())?
            .replace("{{id}}", &default_id)
            .replace("{{type}}", &safe_type)
            .replace("{{name}}", safe_name)
            .replace("{{status}}", "draft")
    } else {
        format!(
            "---\nid: {default_id}\ntype: {safe_type}\nname: {safe_name}\nstatus: draft\n---\n\n# {safe_name}\n"
        )
    };

    write_file_checked(&path, &content, None)
}

#[tauri::command]
fn save_file(
    path: String,
    content: String,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    write_file_checked(&PathBuf::from(path), &content, expected_modified_ms)
}

#[tauri::command]
fn save_template(
    vault_path: String,
    entity_type: String,
    content: String,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    let root = PathBuf::from(&vault_path);
    let safe_type = sanitize_segment(&entity_type)?;
    let path = root
        .join(".everend")
        .join("templates")
        .join(format!("{safe_type}.md"));
    ensure_inside(&root, &path)?;
    write_file_checked(&path, &content, expected_modified_ms)
}

#[tauri::command]
fn rename_path(
    vault_path: String,
    relative_path: String,
    new_name: String,
) -> Result<WriteResult, String> {
    let (root, path) = resolve_vault_path(&vault_path, &relative_path)?;
    if !path.exists() {
        return Err("Path does not exist.".to_string());
    }

    let safe_name = sanitize_segment(&new_name)?;
    let target = path
        .parent()
        .ok_or_else(|| "Path has no parent directory.".to_string())?
        .join(safe_name);
    ensure_inside(&root, &target)?;
    if target.exists() {
        return Ok(WriteResult {
            ok: false,
            path: target.to_string_lossy().to_string(),
            modified_ms: modified_ms(&target),
            message: Some("Target path already exists.".to_string()),
        });
    }

    fs::rename(&path, &target).map_err(|error| error.to_string())?;
    Ok(WriteResult {
        ok: true,
        path: target.to_string_lossy().to_string(),
        modified_ms: modified_ms(&target),
        message: None,
    })
}

#[tauri::command]
fn move_path(
    vault_path: String,
    from_relative_path: String,
    to_folder_relative_path: String,
) -> Result<WriteResult, String> {
    let (root, source) = resolve_vault_path(&vault_path, &from_relative_path)?;
    if !source.exists() {
        return Err("Source path does not exist.".to_string());
    }

    let target_folder = root.join(normalize_relative_path(&to_folder_relative_path)?);
    ensure_inside(&root, &target_folder)?;
    if !target_folder.exists() || !target_folder.is_dir() {
        return Err("Target folder does not exist.".to_string());
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| "Source path has no file name.".to_string())?;
    let target = target_folder.join(file_name);
    ensure_inside(&root, &target)?;
    if target.exists() {
        return Ok(WriteResult {
            ok: false,
            path: target.to_string_lossy().to_string(),
            modified_ms: modified_ms(&target),
            message: Some("Target path already exists.".to_string()),
        });
    }

    fs::rename(&source, &target).map_err(|error| error.to_string())?;
    Ok(WriteResult {
        ok: true,
        path: target.to_string_lossy().to_string(),
        modified_ms: modified_ms(&target),
        message: None,
    })
}

#[tauri::command]
fn duplicate_path(
    vault_path: String,
    relative_path: String,
    target_name: Option<String>,
) -> Result<WriteResult, String> {
    let (root, source) = resolve_vault_path(&vault_path, &relative_path)?;
    if !source.exists() {
        return Err("Source path does not exist.".to_string());
    }

    let target = duplicate_target(&source, target_name)?;
    ensure_inside(&root, &target)?;
    if target.exists() {
        return Ok(WriteResult {
            ok: false,
            path: target.to_string_lossy().to_string(),
            modified_ms: modified_ms(&target),
            message: Some("Target path already exists.".to_string()),
        });
    }

    if source.is_dir() {
        copy_dir_recursive(&source, &target)?;
    } else {
        fs::copy(&source, &target).map_err(|error| error.to_string())?;
    }

    Ok(WriteResult {
        ok: true,
        path: target.to_string_lossy().to_string(),
        modified_ms: modified_ms(&target),
        message: None,
    })
}

#[tauri::command]
fn trash_path(vault_path: String, relative_path: String) -> Result<WriteResult, String> {
    let (_root, path) = resolve_vault_path(&vault_path, &relative_path)?;
    if !path.exists() {
        return Err("Path does not exist.".to_string());
    }

    move_to_system_trash(&path)?;
    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: None,
        message: None,
    })
}

#[tauri::command]
fn reveal_path(path: String) -> Result<WriteResult, String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("Path does not exist.".to_string());
    }
    reveal_in_system(&path)?;
    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(&path),
        message: None,
    })
}

#[tauri::command]
fn reveal_vault(vault_path: String) -> Result<WriteResult, String> {
    let path = PathBuf::from(vault_path);
    if !path.exists() || !path.is_dir() {
        return Err("Vault path does not exist.".to_string());
    }
    open_in_system(&path)?;
    Ok(WriteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(&path),
        message: None,
    })
}

#[tauri::command]
fn list_theme_files(vault_path: String) -> Result<Vec<ThemeManifest>, String> {
    let root = PathBuf::from(&vault_path);
    let theme_dir = root.join(".everend").join("themes");
    if !theme_dir.exists() {
        return Ok(Vec::new());
    }

    ensure_inside(&root, &theme_dir)?;
    let mut themes = Vec::new();
    for entry in fs::read_dir(theme_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if extension != "css" && extension != "json" {
            continue;
        }

        let relative_path = path
            .strip_prefix(&root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let name = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone());

        themes.push(ThemeManifest {
            name,
            relative_path,
            absolute_path: path.to_string_lossy().to_string(),
            content: fs::read_to_string(&path).map_err(|error| error.to_string())?,
            kind: extension.to_string(),
        });
    }
    themes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(themes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id.starts_with("wn:") {
                let _ = app.emit("worldnotion-menu", id);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            open_vault_dialog,
            index_vault,
            path_exists,
            read_file,
            read_file_base64,
            create_universe,
            create_folder,
            create_entity,
            save_file,
            save_template,
            rename_path,
            move_path,
            duplicate_path,
            trash_path,
            reveal_path,
            reveal_vault,
            list_theme_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{normalize_relative_path, sanitize_segment};

    #[test]
    fn normalize_relative_path_rejects_absolute_and_traversal_paths() {
        assert!(normalize_relative_path("../outside.md").is_err());
        assert!(normalize_relative_path("folder/../../outside.md").is_err());
        assert!(normalize_relative_path("C:/outside.md").is_err());
        assert!(normalize_relative_path("folder\\outside.md").is_err());
    }

    #[test]
    fn normalize_relative_path_allows_safe_nested_paths_and_root() {
        assert_eq!(normalize_relative_path("").unwrap().to_string_lossy(), "");
        assert_eq!(normalize_relative_path("Characters/Mara.md").unwrap().components().count(), 2);
    }

    #[test]
    fn sanitize_segment_rejects_empty_hidden_or_nested_names() {
        assert!(sanitize_segment("").is_err());
        assert!(sanitize_segment(".hidden").is_err());
        assert!(sanitize_segment("../Mara.md").is_err());
        assert!(sanitize_segment("Folder/Mara.md").is_err());
    }

    #[test]
    fn sanitize_segment_preserves_safe_names() {
        assert_eq!(sanitize_segment(" Mara Voss.md ").unwrap(), "Mara Voss.md");
    }
}
