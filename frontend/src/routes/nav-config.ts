import {
  Search,
  LineChart,
  History,
  Zap,
  Wallet,
} from "lucide-react";
import type { NavGroup } from "@/types/nav";

export const navGroups: NavGroup[] = [
  {
    label: "Sandbox",
    tabs: [
      { label: "Stock Picker", path: "/sandbox/picker", icon: Search },
      { label: "Stock Analyzer", path: "/sandbox/analyzer", icon: LineChart },
      { label: "Backtesting", path: "/sandbox/backtesting", icon: History },
    ],
  },
  {
    label: "Live",
    tabs: [
      { label: "Live Trade", path: "/live/trade", icon: Zap },
      { label: "Paper Trade", path: "/live/paper-trade", icon: Wallet },
    ],
  },
];
