import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let container: HTMLElement | null = null;
let root: Root | null = null;

/** Real render into a real jsdom DOM via react-dom/client (no RTL). */
export function render(ui: React.ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(ui); });
  return container;
}

export function cleanup(): void {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
}

export function queryByText(match: string | RegExp): HTMLElement | null {
  const all = Array.from(document.body.querySelectorAll("*")).filter((n) => {
    const t = (n.textContent ?? "").trim();
    return typeof match === "string" ? t === match : match.test(t);
  });
  if (all.length === 0) return null;
  // Most-specific match = fewest element descendants.
  all.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
  return all[0] as HTMLElement;
}

export function getByText(match: string | RegExp): HTMLElement {
  const el = queryByText(match);
  if (!el) throw new Error("text not found: " + String(match));
  return el;
}

export function click(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Re-run `assertion` (flushing effects/timers) until it passes or times out. */
export async function waitFor(
  assertion: () => void,
  opts: number | { timeout?: number } = 5000,
): Promise<void> {
  const timeout = typeof opts === "number" ? opts : opts.timeout ?? 5000;
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let err: unknown = null;
    await act(async () => { await sleep(40); });
    try { assertion(); return; } catch (e) { err = e; }
    if (Date.now() - start > timeout) throw err;
  }
}
