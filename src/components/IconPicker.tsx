import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Box,
  Calendar,
  CheckSquare,
  Database,
  FileText,
  Flag,
  Folder,
  Gauge,
  GraduationCap,
  Grid,
  Heart,
  Key,
  Layers,
  Lightbulb,
  Link2,
  List,
  Lock,
  Map,
  Music,
  Package,
  PieChart,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tag,
  Target,
  Trash2,
  TreePine,
  Truck,
  Users,
  Zap,
  X,
} from "lucide-react";
import "../App.css";

export type IconName =
  | "default"
  | "bookmark"
  | "box"
  | "calendar"
  | "checkbox"
  | "database"
  | "document"
  | "flag"
  | "folder"
  | "gauge"
  | "graduation"
  | "grid"
  | "heart"
  | "key"
  | "lightbulb"
  | "link"
  | "list"
  | "lock"
  | "map"
  | "music"
  | "package"
  | "chart"
  | "settings"
  | "shield"
  | "sparkles"
  | "star"
  | "tag"
  | "target"
  | "trash"
  | "tree"
  | "layers"
  | "truck"
  | "users"
  | "zap";

interface IconPickerProps {
  onSelect: (iconName: IconName) => void;
  onClose: () => void;
  x?: number;
  y?: number;
}

const ICON_OPTIONS: Array<{ name: IconName; label: string; Icon: any }> = [
  { name: "default", label: "Default", Icon: Folder },
  { name: "bookmark", label: "Bookmark", Icon: BookOpen },
  { name: "box", label: "Box", Icon: Box },
  { name: "calendar", label: "Calendar", Icon: Calendar },
  { name: "checkbox", label: "Checkbox", Icon: CheckSquare },
  { name: "database", label: "Database", Icon: Database },
  { name: "document", label: "Document", Icon: FileText },
  { name: "flag", label: "Flag", Icon: Flag },
  { name: "folder", label: "Folder", Icon: Folder },
  { name: "gauge", label: "Gauge", Icon: Gauge },
  { name: "graduation", label: "Graduation", Icon: GraduationCap },
  { name: "grid", label: "Grid", Icon: Grid },
  { name: "heart", label: "Heart", Icon: Heart },
  { name: "key", label: "Key", Icon: Key },
  { name: "lightbulb", label: "Lightbulb", Icon: Lightbulb },
  { name: "link", label: "Link", Icon: Link2 },
  { name: "list", label: "List", Icon: List },
  { name: "lock", label: "Lock", Icon: Lock },
  { name: "map", label: "Map", Icon: Map },
  { name: "music", label: "Music", Icon: Music },
  { name: "package", label: "Package", Icon: Package },
  { name: "chart", label: "Chart", Icon: PieChart },
  { name: "settings", label: "Settings", Icon: Settings },
  { name: "shield", label: "Shield", Icon: Shield },
  { name: "sparkles", label: "Sparkles", Icon: Sparkles },
  { name: "star", label: "Star", Icon: Star },
  { name: "tag", label: "Tag", Icon: Tag },
  { name: "target", label: "Target", Icon: Target },
  { name: "trash", label: "Trash", Icon: Trash2 },
  { name: "tree", label: "Tree", Icon: TreePine },
  { name: "layers", label: "Layers", Icon: Layers },
  { name: "truck", label: "Truck", Icon: Truck },
  { name: "users", label: "Users", Icon: Users },
  { name: "zap", label: "Zap", Icon: Zap },
];

export function IconPicker({ onSelect, onClose, x = 0, y = 0 }: IconPickerProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    
    const rect = menuRef.current.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + rect.width > window.innerWidth) {
      adjustedX = Math.max(10, window.innerWidth - rect.width - 10);
    }
    
    if (y + rect.height > window.innerHeight) {
      adjustedY = Math.max(10, window.innerHeight - rect.height - 10);
    }
    
    setAdjustedPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="icon-picker"
      style={{ left: `${adjustedPos.x}px`, top: `${adjustedPos.y}px` }}
    >
      <div className="icon-picker-header">
        <span>Choose Icon</span>
        <button type="button" onClick={onClose} className="icon-picker-close">
          <X size={16} />
        </button>
      </div>
      <div className="icon-picker-grid">
        {ICON_OPTIONS.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            className="icon-picker-item"
            onClick={() => {
              onSelect(name);
              onClose();
            }}
            title={label}
          >
            <Icon size={18} />
            <span className="icon-picker-item-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function getIconComponent(iconName: IconName | undefined | string) {
  if (!iconName || iconName === "default") return Folder;
  const option = ICON_OPTIONS.find((o) => o.name === iconName);
  return option?.Icon || Folder;
}
