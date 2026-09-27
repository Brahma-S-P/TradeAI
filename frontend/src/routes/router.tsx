import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StockPicker } from "@/pages/sandbox/StockPicker";
import { StockAnalyzer } from "@/pages/sandbox/StockAnalyzer";
import { Backtesting } from "@/pages/sandbox/Backtesting";
import { LiveStockPick } from "@/pages/live/LiveStockPick";
import { LiveTrade } from "@/pages/live/LiveTrade";
import { LiveStrategyTest } from "@/pages/live/LiveStrategyTest";
import { PaperTrade } from "@/pages/live/PaperTrade";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/sandbox/picker" replace /> },
      { path: "sandbox/picker", element: <StockPicker /> },
      { path: "sandbox/analyzer", element: <StockAnalyzer /> },
      { path: "sandbox/backtesting", element: <Backtesting /> },
      { path: "live/pick", element: <LiveStockPick /> },
      { path: "live/strategy-test", element: <LiveStrategyTest /> },
      { path: "live/trade", element: <LiveTrade /> },
      { path: "live/paper-trade", element: <PaperTrade /> },
    ],
  },
]);
