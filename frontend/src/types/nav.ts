import type { LucideIcon } from "lucide-react";

export interface NavTab {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  tabs: NavTab[];
}
