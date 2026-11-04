"use client";

import { useRef, useState } from "react";
import type { EngineState, Selections } from "@/lib/engine";

type Saved = { id: string; sentence: string; createdAt: string };
type Notice = { kind: "ok" | "error"; text: string; detail?: string } | null;

// Renders exactly what the engine returns. No rule logic: on every change the server
// sends back the allowed options, the cleaned selections and the composed sentence.
export function Picker({ initial, recent }: { initial: EngineState; recent: Saved[] }) {
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState(recent);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const latest = useRef(0);

  async function refresh(selections: Selections) {
    const n = ++latest.current;
    setBusy(true);
    const res = await fetch("/api/options", { method: "POST", body: JSON.stringify({ selections }) });
    if (n !== latest.current) return; // a newer change is in flight
    setBusy(false);
    if (res.ok) setState(await res.json());
  }

  function choose(variable: string, option: string) {
    setNotice(null);
    // reflect the click immediately; the server's answer replaces this state a moment later
    setState((s) => ({
      ...s,
      variables: s.variables.map((v) =>
        v.key === variable ? { ...v, options: v.options.map((o) => ({ ...o, selected: o.key === option })) } : v,
      ),
    }));
    void refresh({ ...state.selections, [variable]: option });
  }

  async function send(selections: Selections) {
    const res = await fetch("/api/submissions", { method: "POST", body: JSON.stringify({ selections }) });
    const body = await res.json();
    if (res.ok) {
      setNotice({ kind: "ok", text: "Saved." });
      setSaved((s) => [{ id: body.id, sentence: body.sentence, createdAt: new Date().toISOString() }, ...s].slice(0, 5));
    } else {
      setNotice({ kind: "error", text: `Refused by the server (${res.status}): ${body.error}.`, detail: body.detail });
    }
  }

  return (
    <>
      <section aria-labelledby="sentence-h" className="sentence-card">
        <h2 id="sentence-h" className="sr-only">Your sentence</h2>
        <p className="sentence" aria-live="polite" aria-busy={busy}>
          {state.sentence || <span className="placeholder">Pick the weather to start your sentence.</span>}
        </p>
        <div className="actions">
          <button type="button" onClick={() => send(state.selections)} disabled={!state.sentence || busy}>
            Save sentence
          </button>
          <button type="button" className="secondary" onClick={() => refresh({})} disabled={busy}>
            Start over
          </button>
        </div>
        <div role="status" className={notice ? `notice ${notice.kind}` : "notice"}>
          {notice && (
            <>
              {notice.text}
              {notice.detail && <> {notice.detail}</>}
            </>
          )}
        </div>
      </section>

      <form className="questions" onSubmit={(e) => e.preventDefault()}>
        {state.variables.map((v, i) => (
          <fieldset key={v.key} className="card">
            <legend>
              <span className="step">{i + 1}</span> {v.label}
            </legend>
            {v.options.length === 0 ? (
              <p className="muted">No options fit your earlier answers.</p>
            ) : (
              <div className="options">
                {v.options.map((o) => (
                  <label key={o.key} className="option">
                    <input
                      type="radio"
                      name={v.key}
                      value={o.key}
                      checked={o.selected}
                      onChange={() => choose(v.key, o.key)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ))}
      </form>

      <section aria-labelledby="force-h" className="card">
        <h2 id="force-h">Try to break it</h2>
        <p className="muted">
          This sends <code>{`{ weather: "rainy", footwear: "sandals" }`}</code> straight to the API, skipping the form.
          Sandals need sunny weather, so the server refuses and nothing is saved.
        </p>
        <button type="button" className="secondary" onClick={() => send({ weather: "rainy", footwear: "sandals" })}>
          Force rainy + sandals
        </button>
      </section>

      <section aria-labelledby="saved-h" className="card">
        <h2 id="saved-h">Recently saved</h2>
        {saved.length === 0 ? (
          <p className="muted">Nothing saved yet.</p>
        ) : (
          <ol className="saved">
            {saved.map((s) => (
              <li key={s.id}>{s.sentence}</li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
