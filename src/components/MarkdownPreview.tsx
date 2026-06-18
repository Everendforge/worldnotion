import { useMemo } from "react";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import "../App.css";

export interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    try {
      const result = remark()
        .use(remarkGfm)
        .use(remarkHtml, { sanitize: false })
        .processSync(markdown);

      // Process wikilinks in the HTML
      const htmlString = String(result);
      return htmlString.replace(
        /\[\[([^\]]+)\]\]/g,
        '<span class="wikilink" data-target="$1">$1</span>'
      );
    } catch {
      return "<div class='error'>Error rendering markdown</div>";
    }
  }, [markdown]);

  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
