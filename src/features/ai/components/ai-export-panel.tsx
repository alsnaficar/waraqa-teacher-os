import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Eye, Edit2 } from "lucide-react";
import { AIActionToolbar } from "./ai-action-toolbar";
import { AIResultViewer } from "./ai-result-viewer";
import { AIEditor } from "./ai-editor";

interface AIExportPanelProps {
  activeTab: "preview" | "edit";
  onTabChange: (tab: "preview" | "edit") => void;
  content: string;
  onContentChange: (content: string) => void;
  onCopy: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onRegenerate: () => void | Promise<void>;
  isPending?: boolean;
  copied?: boolean;
  exporting?: boolean;
  previewLabel?: string;
  editLabel?: string;
  editorLabel?: string;
}

export function AIExportPanel({
  activeTab,
  onTabChange,
  content,
  onContentChange,
  onCopy,
  onDownload,
  onRegenerate,
  isPending = false,
  copied = false,
  exporting = false,
  previewLabel = "معاينة الواجب",
  editLabel = "تعديل المحتوى",
  editorLabel,
}: AIExportPanelProps) {
  return (
    <div id="ai-export-panel" className="space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as "preview" | "edit")}
        className="w-full"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
          <TabsList className="grid w-full sm:w-[260px] grid-cols-2">
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>{previewLabel}</span>
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              <span>{editLabel}</span>
            </TabsTrigger>
          </TabsList>

          <AIActionToolbar
            onCopy={onCopy}
            onDownload={onDownload}
            onRegenerate={onRegenerate}
            isPending={isPending}
            copied={copied}
            exporting={exporting}
          />
        </div>

        <div className="mt-5">
          <TabsContent value="preview" className="mt-0">
            <AIResultViewer content={content} />
          </TabsContent>

          <TabsContent value="edit" className="mt-0">
            <AIEditor value={content} onChange={onContentChange} label={editorLabel} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
