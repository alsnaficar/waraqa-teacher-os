import { Label } from "@/shared/ui/label";
import type { SelectableCalendarVariant } from "@/features/calendar/services/calendar-variant-selection";
import {
  displayedCalendarVariantId,
  shouldPersistPlanVariantChange,
} from "@/features/calendar/services/calendar-variant-selection";
import { GENERAL_VARIANT_CODE } from "@/features/calendar/services/resolve-calendar";

export function SemesterPlanCalendarField({
  variants,
  calendarVariantId,
  editable,
  disabled,
  onSelect,
}: {
  variants: SelectableCalendarVariant[];
  calendarVariantId: string | null | undefined;
  editable: boolean;
  disabled?: boolean;
  onSelect: (variantId: string) => void;
}) {
  const generalId = variants.find((row) => row.code === GENERAL_VARIANT_CODE)?.id ?? "";
  const value = displayedCalendarVariantId(calendarVariantId, generalId);
  const selected = variants.find((row) => row.id === value) ?? variants[0];

  if (!editable) {
    return (
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-bold text-muted-foreground">التقويم الدراسي</p>
        <p className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-3 text-sm font-semibold">
          {selected?.label ?? "جميع المناطق"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full sm:w-auto space-y-1.5">
      <Label className="text-xs font-bold" htmlFor="semester-plan-calendar-variant">
        التقويم الدراسي
      </Label>
      <select
        id="semester-plan-calendar-variant"
        className="h-11 min-h-[44px] w-full sm:min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        disabled={disabled || variants.length === 0}
        onChange={(event) => {
          const nextId = event.target.value;
          if (!shouldPersistPlanVariantChange(calendarVariantId, nextId, generalId)) {
            return;
          }
          onSelect(nextId);
        }}
      >
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </select>
    </div>
  );
}
