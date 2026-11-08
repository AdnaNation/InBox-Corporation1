"use client";

import { useEffect, useState } from "react";

const planNames = { starter: "Starter", growth: "Growth", business: "Business" };
const cycles = [{ id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" }];

function toInputValue(minor) {
  return minor == null ? "" : (minor / 100).toFixed(2);
}

function toMinor(value) {
  if (value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) return NaN;
  return Math.round(amount * 100);
}

function formatPrice(minor, currency) {
  if (minor == null) return "Not published";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}

export default function PlatformPricingEditor() {
  const [currency, setCurrency] = useState("BDT");
  const [values, setValues] = useState({
    starter: { monthly: "", yearly: "" },
    growth: { monthly: "", yearly: "" },
    business: { monthly: "", yearly: "" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/platform-admin/pricing", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Could not load pricing.");
        if (!active) return;
        setCurrency(result.pricing.currency || "BDT");
        setConfigured(result.configured === true);
        setValues((current) => {
          const next = { ...current };
          for (const plan of Object.keys(next)) {
            next[plan] = {
              monthly: toInputValue(result.pricing.plans?.[plan]?.monthlyMinor),
              yearly: toInputValue(result.pricing.plans?.[plan]?.yearlyMinor),
            };
          }
          return next;
        });
      })
      .catch((error) => { if (active) setNotice(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const plans = {};
      for (const plan of Object.keys(values)) {
        plans[plan] = {
          monthlyMinor: toMinor(values[plan].monthly),
          yearlyMinor: toMinor(values[plan].yearly),
        };
        if (Number.isNaN(plans[plan].monthlyMinor) || Number.isNaN(plans[plan].yearlyMinor)) {
          throw new Error("Enter valid non-negative prices with up to two decimal places.");
        }
      }

      const response = await fetch("/api/platform-admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, plans }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not save pricing.");
      setConfigured(true);
      setNotice(result.message + " Customer billing pages will show these prices; payments are still manual.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Plan pricing</h2>
          <p className="mt-1 text-sm text-slate-500">Set the prices customers see on their billing page. This does not collect payments or activate subscriptions.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{configured ? "Pricing configured" : "Not configured"}</span>
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{notice}</p>}
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading pricing…</p> : (
        <form onSubmit={save} className="mt-5 space-y-5">
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Display currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="BDT">BDT — Bangladeshi Taka</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </label>

          <div className="grid gap-4 lg:grid-cols-3">
            {Object.entries(planNames).map(([plan, label]) => (
              <div key={plan} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">{label}</h3>
                <div className="mt-3 space-y-3">
                  {cycles.map((cycle) => (
                    <label key={cycle.id} className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">{cycle.label} price ({currency})</span>
                      <input
                        type="number"
                        min="0"
                        max="1000000000"
                        step="0.01"
                        inputMode="decimal"
                        value={values[plan][cycle.id]}
                        onChange={(event) => setValues((current) => ({
                          ...current,
                          [plan]: { ...current[plan], [cycle.id]: event.target.value },
                        }))}
                        placeholder="Leave blank to hide"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                      <span className="mt-1 block text-xs text-slate-400">{formatPrice(toMinor(values[plan][cycle.id]), currency)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs leading-5 text-slate-500">Prices are stored as integer minor units. Leave a field blank to hide that billing option. Existing subscriptions and plan limits are not changed.</p>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Save pricing"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
