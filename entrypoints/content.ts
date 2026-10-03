import { browser } from "wxt/browser";
import type { SafetySignals } from "../src/shared/types";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main(ctx) {
    const controller = new AbortController();
    const dirty = new Map<Element, string>();
    let lastSent: string | null = null;
    let queued = false;

    function editableElement(target: EventTarget | null): Element | null {
      if (!(target instanceof Element)) return null;
      if (target instanceof HTMLInputElement) {
        const ignored = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
        return ignored.has(target.type) ? null : target;
      }
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target;
      return target.closest("[contenteditable='true'], [contenteditable='']");
    }

    function valueOf(element: Element): string {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value;
      }
      return element.textContent ?? "";
    }

    function originalValueOf(element: Element): string {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.defaultValue;
      if (element instanceof HTMLSelectElement) {
        return [...element.options].filter((option) => option.defaultSelected).map((option) => option.value).join("\n");
      }
      // Most chat composers become empty after a message is sent.
      return "";
    }

    function isMediaPlaying(): boolean {
      for (const media of document.querySelectorAll("audio, video")) {
        if (!(media instanceof HTMLMediaElement) || media.paused || media.ended) continue;
        if (media.srcObject || !media.muted || document.pictureInPictureElement === media) return true;
      }
      return false;
    }

    function currentSafety(): SafetySignals {
      for (const element of dirty.keys()) {
        if (!element.isConnected || valueOf(element) === originalValueOf(element)) dirty.delete(element);
      }
      return {
        editing: dirty.size > 0,
        media: isMediaPlaying(),
      };
    }

    function publish(force = false): void {
      const safety = currentSafety();
      const serialized = JSON.stringify(safety);
      if (!force && serialized === lastSent) return;
      lastSent = serialized;
      // Only two booleans leave the page. No text, form values, or URLs are sent.
      void browser.runtime.sendMessage({ type: "safetyUpdate", safety }).catch(() => {});
    }

    function queuePublish(): void {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        publish();
      });
    }

    function noteEdit(event: Event): void {
      const element = editableElement(event.target);
      if (element) {
        if (valueOf(element) === originalValueOf(element)) dirty.delete(element);
        else dirty.set(element, "changed");
      }
      queuePublish();
    }

    function noteSubmit(event: Event): void {
      if (event.target instanceof HTMLFormElement) {
        for (const element of dirty.keys()) {
          if (event.target.contains(element)) dirty.delete(element);
        }
      }
      queuePublish();
    }

    const options: AddEventListenerOptions = { capture: true, signal: controller.signal };
    document.addEventListener("input", noteEdit, options);
    document.addEventListener("change", noteEdit, options);
    document.addEventListener("submit", noteSubmit, options);
    document.addEventListener("focusin", queuePublish, options);
    document.addEventListener("focusout", queuePublish, options);
    document.addEventListener("keydown", (event) => {
      const commandModifier = (event.ctrlKey && !event.metaKey) || (event.metaKey && !event.ctrlKey);
      if (event.repeat || event.isComposing || !commandModifier || !event.shiftKey || event.altKey ||
          (event.code !== "KeyU" && event.key.toLowerCase() !== "u")) return;
      event.preventDefault();
      event.stopPropagation();
      void browser.runtime.sendMessage({ type: "shortcutFromPage" }).catch(() => {});
    }, options);
    for (const event of ["play", "pause", "ended", "emptied", "loadeddata", "volumechange"]) {
      document.addEventListener(event, queuePublish, options);
    }
    window.addEventListener("pagehide", () => {
      void browser.runtime.sendMessage({ type: "safetyUpdate", safety: { editing: false, media: false } }).catch(() => {});
    }, { signal: controller.signal });

    const onMessage = (message: unknown, _sender: unknown, sendResponse: (response: SafetySignals) => void) => {
      if (message && typeof message === "object" && (message as { type?: string }).type === "getSafety") {
        const safety = currentSafety();
        publish(true);
        sendResponse(safety);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      controller.abort();
      browser.runtime.onMessage.removeListener(onMessage);
    });
    publish(true);
  },
});
