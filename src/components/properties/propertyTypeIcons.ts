import {
  Calendar,
  CheckSquare,
  File,
  Folder,
  Globe,
  Hash,
  Image,
  Link2,
  List,
  Mail,
  Network,
  Phone,
  Tags,
  Text,
  type LucideIcon,
} from "lucide-react";
import type { CustomFieldType } from "../../editorTypes";

export const PROPERTY_TYPE_ICONS: Record<CustomFieldType, LucideIcon> = {
  text: Text,
  number: Hash,
  boolean: CheckSquare,
  date: Calendar,
  select: List,
  multiselect: Tags,
  "entity-ref": Link2,
  "entity-ref-list": Network,
  url: Globe,
  email: Mail,
  phone: Phone,
  file: File,
  image: Image,
  group: Folder,
};

export const PROPERTY_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  boolean: "Checkbox",
  date: "Date",
  select: "Select",
  multiselect: "Multi-select",
  "entity-ref": "Entity link",
  "entity-ref-list": "Entity links",
  url: "URL",
  email: "Email",
  phone: "Phone",
  file: "File",
  image: "Image",
  group: "Group",
};

export function propertyTypeIcon(type: string): LucideIcon {
  return PROPERTY_TYPE_ICONS[type as CustomFieldType] ?? Text;
}
