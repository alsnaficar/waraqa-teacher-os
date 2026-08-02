import { Copy, Download, RefreshCw, Check } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface AIActionToolbarProps {
  onCopy: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onRegenerate: () => void | Promise<void>;
  isPending?: boolean;
  copied?: boolean;
  exporting?: boolean;
}

export function AIActionToolbar({
  onCopy,
  onDownload,
  onRegenerate,
  isPending = false,
  copied = false,
  exporting = false,
}: AIActionToolbarProps) {
  return (
    <div id="ai-action-toolbar" className="flex flex-wrap items-center gap-2">
      <Button id="btn-copy" variant="outline" size="sm" onClick={onCopy} className="gap-1.5 h-9">
        {copied ? (
          <>
            <Check className="h-4 w-4 text-emerald-500" />
            <span>تم النسخ</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span>نسخ</span>
          </>
        )}
      </Button>
      <Button
        id="btn-download"
        variant="outline"
        size="sm"
        onClick={onDownload}
        disabled={exporting}
        className="gap-1.5 h-9"
      >
        <Download className="h-4 w-4" />
        <span>تنزيل DOCX</span>
      </Button>
      <Button
        id="btn-regenerate"
        variant="ghost"
        size="sm"
        onClick={onRegenerate}
        disabled={isPending}
        className="gap-1.5 h-9 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        <span>إعادة توليد</span>
      </Button>
    </div>
  );
}
