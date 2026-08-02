import Markdown from "react-markdown";

interface AIResultViewerProps {
  content: string;
  className?: string;
}

export function AIResultViewer({ content, className = "" }: AIResultViewerProps) {
  return (
    <div
      id="ai-result-viewer"
      className={`p-5 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50 overflow-auto max-h-[600px] shadow-inner ${className}`}
    >
      <div
        className="markdown-body prose prose-slate prose-sm max-w-none text-right leading-relaxed dark:prose-invert"
        dir="rtl"
      >
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
