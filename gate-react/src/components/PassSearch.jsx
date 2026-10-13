import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { cls } from "./common.jsx";

const SECTION_ICONS = { visitor: "🧑", vehicle: "🚗", cargo: "📦" };

// The pass a person shows at the gate: type its number (or ref no., vehicle
// no., container no., name), pick the match, and it becomes the arrival
// being verified. Enter on an exact match starts it straight away.
export default function PassSearch({ gateId, onStart, disabled, inputRef }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const latest = useRef(0); // ignore replies to older searches
  const boxRef = useRef(null);

  const search = async (text) => {
    const id = ++latest.current;
    if (text.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return [];
    }
    setSearching(true);
    try {
      const found = await api(`/gates/${gateId}/passes?q=${encodeURIComponent(text.trim())}`);
      if (id !== latest.current) return null;
      setResults(found);
      setActive(0);
      setError(null);
      return found;
    } catch (err) {
      if (id === latest.current) setError(err.message);
      return null;
    } finally {
      if (id === latest.current) setSearching(false);
    }
  };

  // Search as the operator types (debounced)
  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    const t = setTimeout(() => search(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  // Close the list on a click outside
  useEffect(() => {
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const start = async (hit) => {
    if (!hit || disabled) return;
    const started = await onStart(hit);
    if (started) {
      setTerm("");
      setResults([]);
      setOpen(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    // Search now rather than wait for the debounce
    const found = (await search(term)) ?? results;
    if (found.length === 1 || found[0]?.exact) start(found[0]);
    else setOpen(true);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (open) setOpen(false);
      else setTerm("");
    } else if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      start(results[active]);
    }
  };

  const showList = open && term.trim().length >= 2;

  return (
    <div className="pass-search" ref={boxRef}>
      <form className="pass-search-bar" onSubmit={submit} role="search">
        <label htmlFor="passSearchInput" className="pass-search-label">
          Pass No.
        </label>
        <input
          id="passSearchInput"
          ref={inputRef}
          type="search"
          autoComplete="off"
          spellCheck="false"
          placeholder="Pass no. / Ref no. / Vehicle no. / Container no. / Name   (F2)"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="passSearchResults"
          aria-activedescendant={showList && results[active] ? `pass-hit-${active}` : undefined}
        />
        <button type="submit" className="pass-search-btn" disabled={disabled || !term.trim()}>
          {searching ? "Searching…" : "Verify Pass"}
        </button>
      </form>

      {showList && (
        <ul className="pass-results" id="passSearchResults" role="listbox">
          {error && <li className="pass-results-note error">{error}</li>}
          {!error && !searching && results.length === 0 && (
            <li className="pass-results-note">No pass found for “{term.trim()}”</li>
          )}
          {results.map((hit, i) => (
            <li
              key={hit.visitorId}
              id={`pass-hit-${i}`}
              role="option"
              aria-selected={i === active}
              className={cls("pass-hit", i === active && "active")}
              onPointerEnter={() => setActive(i)}
              onClick={() => start(hit)}
            >
              <span className="pass-hit-photo">
                {hit.photo ? <img src={hit.photo} alt="" /> : SECTION_ICONS.visitor}
              </span>
              <span className="pass-hit-main">
                <span className="pass-hit-name">{hit.name}</span>
                <span className="pass-hit-sub">
                  {hit.passType} · {hit.passNo} · REF {hit.ref}
                </span>
                <span className="pass-hit-sub">
                  {hit.company}
                  {hit.plate ? ` · ${hit.plate}` : ""} · {hit.validity}
                </span>
              </span>
              <span className="pass-hit-side">
                <span className="pass-hit-sections" aria-label={hit.sections.join(", ")}>
                  {hit.sections.map((s) => SECTION_ICONS[s]).join(" ")}
                </span>
                <span className={hit.problem ? "badge-fail" : "badge-ok"}>
                  {hit.problem ? `✕ ${hit.problem}` : "✓ Valid"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
