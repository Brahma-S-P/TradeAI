import { useState } from "react";
import { apiPost } from "@/lib/api";

interface OrderTicketPanelProps {
  onSubmit?: () => void;
}

export function OrderTicketPanel({ onSubmit }: OrderTicketPanelProps) {
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderType, setOrderType] = useState("MARKET");
  const [price, setPrice] = useState("");
  const [stoploss, setStoploss] = useState("");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function handleOrder(side: "BUY" | "SELL") {
    if (!symbol || !quantity) return;
    setStatus(null);
    try {
      const res = await apiPost<{ status: string; order_id?: string; message?: string }>("/trading/order", {
        symbol: symbol.toUpperCase(),
        side,
        quantity: parseInt(quantity, 10),
        order_type: orderType,
        price: price ? parseFloat(price) : null,
        stoploss: stoploss ? parseFloat(stoploss) : null,
        target: target ? parseFloat(target) : null,
      });
      if (res.status === "success") {
        setStatus({ type: "success", msg: `Order placed: ${res.order_id}` });
        onSubmit?.();
      } else {
        setStatus({ type: "error", msg: res.message || "Order failed" });
      }
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message || "Network error" });
    }
  }

  const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Order Ticket
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Instrument">
          <input type="text" placeholder="e.g. RELIANCE" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Quantity">
          <input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Order Type">
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={inputClass}>
            <option value="MARKET">Market</option>
            <option value="LIMIT">Limit</option>
            <option value="SL">SL</option>
            <option value="SL-M">SL-M</option>
          </select>
        </Field>
        <Field label="Price">
          <input type="number" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} disabled={orderType === "MARKET"} />
        </Field>
        <Field label="Stop Loss">
          <input type="number" placeholder="0.00" value={stoploss} onChange={(e) => setStoploss(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Target">
          <input type="number" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {status && (
        <div className={`rounded-md px-3 py-1.5 text-xs font-medium ${status.type === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"}`}>
          {status.msg}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => handleOrder("BUY")} className="flex-1 rounded-md bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">BUY</button>
        <button onClick={() => handleOrder("SELL")} className="flex-1 rounded-md bg-red-600 py-1.5 text-sm font-medium text-white hover:bg-red-700">SELL</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
