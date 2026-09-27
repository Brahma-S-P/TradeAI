export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400 dark:border-slate-800">
      {text}
    </div>
  );
}
