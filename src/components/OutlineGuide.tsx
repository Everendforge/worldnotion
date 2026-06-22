import { useState } from "react";
import type { OutlineHeader } from "../utils/outlineExtractor";

interface OutlineGuideProps {
  outline: OutlineHeader[];
  currentHeader: OutlineHeader | null;
  onNavigate: (line: number) => void;
  position?: "left" | "right";
}

export function OutlineGuide({
  outline,
  currentHeader,
  onNavigate,
  position = "right",
}: OutlineGuideProps) {
  const [isHovered, setIsHovered] = useState(false);

  const renderHeader = (header: OutlineHeader, depth = 0) => {
    const isCurrent = currentHeader?.id === header.id;

    return (
      <div key={header.id}>
        <div
          className={`outline-item ${isCurrent ? "active" : ""}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => onNavigate(header.line)}
          title={header.text}
        >
          <span className="outline-item-text">{header.text}</span>
        </div>
        {header.children.map((child) => renderHeader(child, depth + 1))}
      </div>
    );
  };

  if (outline.length === 0) {
    return null;
  }

  return (
    <div 
      className={`outline-guide-notion position-${position} ${isHovered ? "hovered" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {outline.map((header) => renderHeader(header, 0))}
    </div>
  );
}
