import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

interface AIEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  className?: string;
}

export function AIEditor({
  value,
  onChange,
  label = "يمكنك تعديل الأسئلة أو الإجابات وصياغتها هنا بصيغة Markdown قبل الحفظ أو التصدير:",
  id = "edited-worksheet-content",
  className = "",
}: AIEditorProps) {
  return (
    <div id="ai-editor-container" className={`space-y-2 ${className}`}>
      {label && (
        <Label htmlFor={id} className="text-xs text-muted-foreground block mb-1">
          {label}
        </Label>
      )}
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[450px] font-mono text-sm leading-relaxed text-right dir-rtl p-4"
        dir="rtl"
      />
    </div>
  );
}
