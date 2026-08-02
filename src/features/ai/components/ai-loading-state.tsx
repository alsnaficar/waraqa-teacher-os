import { Clock, Sparkle } from "lucide-react";

interface AILoadingStateProps {
  title?: string;
  description?: string;
  estimatedTimeText?: string;
}

export function AILoadingState({
  title = "جارٍ توليد المحتوى الذكي...",
  description = "يقوم الذكاء الاصطناعي بصياغة الأسئلة، تنظيم مفتاح الإجابات وتنسيق محتوى الدرس.",
  estimatedTimeText = "قد يستغرق ذلك ما يصل إلى 20 ثانية",
}: AILoadingStateProps) {
  return (
    <div
      id="ai-loading-state"
      className="flex min-h-[450px] flex-col items-center justify-center space-y-6 text-center"
    >
      <div className="relative flex items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600"></div>
        <Sparkle className="absolute h-6 w-6 text-indigo-600 animate-pulse" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">{description}</p>
      </div>
      <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 border px-3 py-1.5 rounded-full flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 animate-spin" />
        <span>{estimatedTimeText}</span>
      </div>
    </div>
  );
}
