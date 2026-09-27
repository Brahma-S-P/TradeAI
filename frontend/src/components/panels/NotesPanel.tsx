import { StickyNote } from "lucide-react";

interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
  stockSymbol?: string;
}

export function NotesPanel({ value, onChange, stockSymbol }: NotesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <StickyNote size={12} />
        Notes{stockSymbol ? ` — ${stockSymbol}` : ""}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add your analysis notes here..."
        className="flex-1 resize-none rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
      />
    </div>
  );
}
