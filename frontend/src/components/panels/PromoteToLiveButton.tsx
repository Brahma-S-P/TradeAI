import { ArrowRightCircle } from "lucide-react";

interface PromoteToLiveButtonProps {
  onPromote?: () => void;
  disabled?: boolean;
}

export function PromoteToLiveButton({ onPromote, disabled = false }: PromoteToLiveButtonProps) {
  return (
    <button
      onClick={onPromote}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowRightCircle size={14} />
      Promote to Live
    </button>
  );
}
