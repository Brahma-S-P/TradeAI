import { Save } from "lucide-react";

interface SaveStrategyButtonProps {
  onSave?: () => void;
  disabled?: boolean;
  label?: string;
}

export function SaveStrategyButton({ onSave, disabled = false, label = "Save Strategy" }: SaveStrategyButtonProps) {
  return (
    <button
      onClick={onSave}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Save size={11} />
      {label}
    </button>
  );
}
