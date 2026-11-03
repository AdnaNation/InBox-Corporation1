"use client";

import { useEffect, useRef, useState } from "react";
import { Facebook, Loader2, ShieldCheck } from "lucide-react";

export default function WhatsAppEmbeddedSignup({ connected, onConnected }) {
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const completionRef = useRef({ code: "", wabaId: "", phoneNumberId: "", submitted: false });
  const replaceRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/embedded-signup", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load Meta signup configuration.");
        if (active) setConfig(data);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoadingConfig(false));

    return () => { active = false; };
  }, []);

  async function completeIfReady() {
    const current = completionRef.current;
    if (!current.code || !current.wabaId || !current.phoneNumberId || current.submitted) return;
    current.submitted = true;
    setBusy(true);
    setError("");
    setNotice("Verifying your WhatsApp Business account with Meta...");
    try {
      const response = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: current.code,
          wabaId: current.wabaId,
          phoneNumberId: current.phoneNumberId,
          replaceExisting: replaceRef.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "REPLACEMENT_CONFIRMATION_REQUIRED") {
          setReplaceExisting(true);
          replaceRef.current = true;
          current.submitted = false;
          setNotice("A different number is already connected. Confirm replacement, then start signup again.");
          return;
        }
        throw new Error(data.message || "Could not complete WhatsApp connection.");
      }
      setNotice(data.message || "WhatsApp connected.");
      completionRef.current = { code: "", wabaId: "", phoneNumberId: "", submitted: false };
      await onConnected?.();
    } catch (err) {
      setError(err.message || "Could not complete WhatsApp connection.");
      current.submitted = false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!config?.configured) return;

    const handleMessage = (event) => {
      let hostname = "";
      try { hostname = new URL(event.origin).hostname; } catch { return; }
      if (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com")) return;

      let payload = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;

      const eventName = payload.event;
      const data = payload.data || {};
      if (["FINISH", "FINISH_ONLY_WABA", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"].includes(eventName)) {
        completionRef.current.wabaId = String(data.waba_id || data.wabaId || "");
        completionRef.current.phoneNumberId = String(data.phone_number_id || data.phoneNumberId || "");
        completeIfReady();
      } else if (eventName === "CANCEL") {
        setNotice("Meta signup was cancelled. You can start again whenever you're ready.");
      } else if (eventName === "ERROR") {
        setError("Meta reported an error during signup. Please try again.");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [config]);

  useEffect(() => {
    if (!config?.configured) return;
    if (window.FB) {
      window.FB.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.apiVersion || "v26.0" });
      setSdkReady(true);
      return;
    }

    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.FB) {
        window.FB.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.apiVersion || "v26.0" });
        setSdkReady(true);
      }
    };
    script.onerror = () => setError("Could not load the Meta login SDK. Check your browser connection and allowed domains.");
    document.body.appendChild(script);
  }, [config]);

  function launchSignup() {
    setError("");
    setNotice("");
    if (!config?.configured || !window.FB) {
      setError("Meta signup is not ready yet. Refresh the page and try again.");
      return;
    }
    if (connected && !replaceExisting) {
      setError("A WhatsApp number is already connected. Enable replacement first if you intend to switch numbers.");
      return;
    }

    completionRef.current = { code: "", wabaId: "", phoneNumberId: "", submitted: false };
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) {
        setNotice("Meta signup was not completed. You can try again.");
        return;
      }
      completionRef.current.code = code;
      completeIfReady();
    }, {
      config_id: config.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {},
    });
  }

  return (
    <section className="mb-5 rounded-2xl border border-green-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-green-50 p-3 text-green-700"><Facebook size={21} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Connect with Meta</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Let Meta securely guide your business through connecting its WhatsApp Business Account. Your access token is exchanged and stored on our server.
          </p>
        </div>
      </div>

      {connected && (
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(event) => {
              setReplaceExisting(event.target.checked);
              replaceRef.current = event.target.checked;
            }}
            className="mt-1"
          />
          I understand this will replace the currently connected number after the new account is verified.
        </label>
      )}

      <button
        type="button"
        onClick={launchSignup}
        disabled={loadingConfig || busy || !config?.configured || !sdkReady || (connected && !replaceExisting)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy || loadingConfig || (config?.configured && !sdkReady) ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
        {connected ? "Connect a different number with Meta" : "Continue with Meta"}
      </button>

      {!loadingConfig && !config?.configured && (
        <p className="mt-3 text-xs leading-5 text-amber-700">
          Add NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID in Vercel, and META_APP_ID / META_APP_SECRET on the server, to enable this button.
        </p>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
    </section>
  );
}
