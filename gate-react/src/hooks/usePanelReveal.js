import { useEffect, useReducer, useRef } from "react";

const LEAVE_DELAY = 160; // ms before a hover preview clears
const AIM_DELAY = 250;
const SETTLE_TIME = 100; // no movement for this long = pointer has settled

const isTouch = (e) => e.pointerType === "touch";

// Hover a sidebar check to preview its panel; click / tap it to pin the
// panel open (click again or press Esc to release). One panel at a time.
//
// Menu-aim: a diagonal move from one check towards the open panel can cross
// another check on the way. That must not switch the panel, or a click meant
// for one verification could land on another.
//
// `fallback` is the panel shown when nothing is previewed or pinned
// (the Visitor panel for a visitor-only pass).
export default function usePanelReveal(fallback = null) {
  const sidebarRef = useRef(null);
  const cards = useRef({});
  const items = useRef({});
  const s = useRef({
    preview: null, // shown while the pointer hovers a check
    pinned: null, // stays shown after hover ends
    hovered: null, // check currently under the pointer
    trail: [], // last few pointer positions over the sidebar
    lastMove: 0,
    hideTimer: null,
    aimTimer: null,
  });
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [, rerender] = useReducer((n) => n + 1, 0);

  // Timers read state from refs, so callbacks never see stale values
  const shown = () => s.current.preview || s.current.pinned || fallbackRef.current;

  const update = (patch) => {
    Object.assign(s.current, patch);
    rerender();
  };

  const cancelHide = () => {
    clearTimeout(s.current.hideTimer);
    s.current.hideTimer = null;
  };

  const cancelAim = () => clearTimeout(s.current.aimTimer);

  const scheduleHide = (delay) => {
    cancelHide();
    s.current.hideTimer = setTimeout(() => {
      s.current.hideTimer = null;
      if (s.current.preview) update({ preview: null });
    }, delay);
  };

  // Leaving the sidebar towards the panel gets a longer grace period, sized
  // to the gap between them (the panel is centred, so the gap grows on wide
  // screens).
  const travelGrace = () => {
    const card = cards.current[shown()];
    if (!sidebarRef.current || !card) return LEAVE_DELAY;
    const gap =
      card.getBoundingClientRect().left - sidebarRef.current.getBoundingClientRect().right;
    return Math.min(800, 250 + Math.max(0, gap) * 1.2);
  };

  const previewFor = (key) => {
    cancelHide();
    if (s.current.preview !== key) update({ preview: key });
  };

  // Is the pointer, now at (x, y), moving into the cone between its recent
  // position and the left edge of the panel on screen?
  const headingToShown = (x, y) => {
    const card = cards.current[shown()];
    const from = s.current.trail[0];
    if (!card || !from) return false;
    const dx = x - from.x;
    if (dx <= 0) return false; // straight down/up = scanning the checks
    const r = card.getBoundingClientRect();
    if (from.x >= r.left) return false;
    const slope = (y - from.y) / dx;
    const slopeTop = (r.top - from.y) / (r.left - from.x);
    const slopeBottom = (r.bottom - from.y) / (r.left - from.x);
    return slope >= slopeTop && slope <= slopeBottom;
  };

  // Switch instantly when scanning; wait while the pointer is heading for the
  // open panel, and switch once it settles on this check.
  const requestPreview = (key, x, y) => {
    cancelAim();
    const current = shown();
    if (current && current !== key && headingToShown(x, y)) {
      s.current.aimTimer = setTimeout(() => {
        if (s.current.hovered !== key) return; // moved on — no switch
        const trail = s.current.trail;
        const last = trail[trail.length - 1];
        const settled = performance.now() - s.current.lastMove >= SETTLE_TIME;
        if (settled || !last) previewFor(key);
        else requestPreview(key, last.x, last.y); // still moving: re-check
      }, AIM_DELAY);
      return;
    }
    previewFor(key);
  };

  const togglePin = (key) => {
    cancelHide();
    cancelAim();
    // A mouse click on a hovered check also makes it the preview, so the
    // panel stays while hovered even after unpinning. Taps and keys don't.
    update({
      preview: s.current.hovered === key ? key : null,
      pinned: s.current.pinned === key ? null : key,
    });
  };

  // Working inside a panel pins it, so it can't vanish mid-task
  const pinIfShown = (key) => {
    if (shown() === key && s.current.pinned !== key) {
      cancelHide();
      update({ pinned: key });
    }
  };

  // Open a panel and keep it open (e.g. when a new arrival is loaded)
  const pin = (key) => {
    cancelHide();
    cancelAim();
    update({ preview: null, pinned: key });
  };

  const close = () => {
    cancelHide();
    cancelAim();
    const key = shown();
    const card = cards.current[key];
    const focusWasInside = !!(card && card.contains(document.activeElement));
    update({ preview: null, pinned: null });
    // Don't strand keyboard focus inside a panel that just hid
    if (focusWasInside && items.current[key]) items.current[key].focus();
  };

  useEffect(
    () => () => {
      clearTimeout(s.current.hideTimer);
      clearTimeout(s.current.aimTimer);
    },
    [],
  );

  const sidebarProps = {
    ref: sidebarRef,
    onPointerEnter: (e) => {
      if (isTouch(e)) return;
      s.current.trail = [];
      cancelHide();
    },
    onPointerMove: (e) => {
      if (isTouch(e)) return;
      s.current.lastMove = performance.now();
      s.current.trail.push({ x: e.clientX, y: e.clientY });
      if (s.current.trail.length > 4) s.current.trail.shift();
    },
    onPointerLeave: (e) => {
      if (isTouch(e)) return;
      cancelAim();
      s.current.trail = [];
      const right = sidebarRef.current ? sidebarRef.current.getBoundingClientRect().right : 0;
      scheduleHide(e.clientX >= right - 2 ? travelGrace() : LEAVE_DELAY);
    },
  };

  // Touch has no hover, so touch pointers skip straight to the click (pin)
  const itemProps = (key) => ({
    ref: (el) => {
      items.current[key] = el;
    },
    onPointerEnter: (e) => {
      if (isTouch(e)) return;
      s.current.hovered = key;
      requestPreview(key, e.clientX, e.clientY);
    },
    onPointerLeave: (e) => {
      if (!isTouch(e) && s.current.hovered === key) s.current.hovered = null;
    },
    // Mouse click, touch tap, Enter and Space all arrive here
    onClick: () => togglePin(key),
  });

  const cardProps = (key) => ({
    ref: (el) => {
      cards.current[key] = el;
    },
    // The panel stays open while the pointer is on it
    onPointerEnter: (e) => {
      if (!isTouch(e) && shown() === key) cancelHide();
    },
    onPointerLeave: (e) => {
      if (!isTouch(e) && s.current.preview) scheduleHide(LEAVE_DELAY);
    },
    onPointerDown: () => pinIfShown(key),
    onFocus: () => pinIfShown(key),
  });

  return {
    shown: shown(),
    pinned: s.current.pinned,
    sidebarProps,
    itemProps,
    cardProps,
    close,
    pin,
  };
}
