var y = Object.defineProperty;
var b = (s, e, t) => e in s ? y(s, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : s[e] = t;
var a = (s, e, t) => b(s, typeof e != "symbol" ? e + "" : e, t);
class E {
  constructor(e) {
    a(this, "textarea");
    a(this, "storageKey");
    if (!e || !(e instanceof HTMLTextAreaElement))
      throw new Error("MoodleTextareaAdapter requires a valid HTMLTextAreaElement.");
    this.textarea = e, this.storageKey = this.generateStorageKey(), this.hideTextarea();
  }
  /**
   * Visually hides the Moodle textarea while preserving its presence in the form for submission.
   */
  hideTextarea() {
    this.textarea.style.position = "absolute", this.textarea.style.left = "-9999px", this.textarea.style.opacity = "0", this.textarea.style.pointerEvents = "none", this.textarea.setAttribute("tabindex", "-1"), this.textarea.setAttribute("aria-hidden", "true");
  }
  /**
   * Generates a stable unique hash identifier for this textarea based on location and identifier.
   */
  generateStorageKey() {
    const e = typeof window < "u" && window.location ? window.location.origin : "host", t = typeof window < "u" && window.location ? window.location.pathname : "", r = this.textarea.name || this.textarea.id || "unnamed-box", n = `${e}${t}#${r}`;
    let i = 0;
    for (let o = 0; o < n.length; o++) {
      const l = n.charCodeAt(o);
      i = (i << 5) - i + l, i |= 0;
    }
    return `lms_widget_backup_${Math.abs(i).toString(36)}`;
  }
  /**
   * Retrieves the current content.
   * If the Moodle textarea is empty, attempts crash recovery from localStorage.
   */
  load() {
    const e = this.textarea.value;
    if (e && e.trim().length > 0)
      return e;
    try {
      if (typeof window < "u" && window.localStorage) {
        const t = window.localStorage.getItem(this.storageKey);
        if (t && t.trim().length > 0)
          return this.textarea.value = t, this.dispatchChangeEvents(), t;
      }
    } catch (t) {
      console.warn("[MoodleTextareaAdapter] Unable to access localStorage during load:", t);
    }
    return e || "";
  }
  /**
   * Saves content to the Moodle textarea, triggers change/input events for Moodle autosave,
   * stores a local backup, and verifies the written value.
   * Returns false if the write was rejected or failed verification.
   */
  save(e) {
    if (this.isReadOnly())
      return console.warn("[MoodleTextareaAdapter] Cannot save: Host textarea is read-only or disabled."), !1;
    try {
      if (this.textarea.value = e, this.dispatchChangeEvents(), typeof window < "u" && window.localStorage)
        try {
          window.localStorage.setItem(this.storageKey, e);
        } catch (r) {
          console.warn("[MoodleTextareaAdapter] LocalStorage backup write failed:", r);
        }
      const t = this.textarea.value === e;
      return t || console.error("[MoodleTextareaAdapter] Verification failed: textarea value does not match content."), t;
    } catch (t) {
      return console.error("[MoodleTextareaAdapter] Failed to save content to textarea:", t), !1;
    }
  }
  /**
   * Checks if the Moodle textarea is disabled or read-only (e.g., past deadline).
   */
  isReadOnly() {
    return this.textarea.disabled || this.textarea.readOnly || this.textarea.getAttribute("aria-disabled") === "true";
  }
  /**
   * Returns the unique storage identifier.
   */
  getIdentifier() {
    return this.storageKey;
  }
  /**
   * Dispatches input and change events so Moodle's native form trackers and autosave pick up modifications.
   */
  dispatchChangeEvents() {
    const e = new Event("input", { bubbles: !0, cancelable: !0 }), t = new Event("change", { bubbles: !0, cancelable: !0 });
    this.textarea.dispatchEvent(e), this.textarea.dispatchEvent(t);
  }
}
const c = {
  REQUEST_CONTENT: "REQUEST_CONTENT",
  SYNC_CONTENT: "SYNC_CONTENT",
  SYNC_HEIGHT: "SYNC_HEIGHT",
  LOAD_CONTENT: "LOAD_CONTENT",
  SYNC_ACK: "SYNC_ACK",
  ERROR_LOCKDOWN: "ERROR_LOCKDOWN"
};
class x {
  constructor(e, t = "*") {
    a(this, "iframe");
    a(this, "targetOrigin");
    a(this, "handlers", /* @__PURE__ */ new Set());
    a(this, "isLockedDown", !1);
    a(this, "messageListener", null);
    if (!e || !(e instanceof HTMLIFrameElement))
      throw new Error("IframeMessengerAdapter requires a valid HTMLIFrameElement.");
    this.iframe = e, this.targetOrigin = t, this.setupListener();
  }
  setupListener() {
    this.messageListener = (e) => {
      if (this.isLockedDown || !this.iframe.contentWindow || e.source !== this.iframe.contentWindow || this.targetOrigin !== "*" && e.origin !== this.targetOrigin)
        return;
      let t = e.data;
      if (typeof t == "string")
        try {
          t = JSON.parse(t);
        } catch {
          return;
        }
      if (!t || typeof t != "object")
        return;
      const { type: r, payload: n, msgId: i } = t;
      typeof r == "string" && this.handlers.forEach((o) => {
        try {
          o(r, n, i);
        } catch (l) {
          console.error("[IframeMessengerAdapter] Error in message handler:", l);
        }
      });
    }, window.addEventListener("message", this.messageListener);
  }
  post(e) {
    if (!this.isLockedDown) {
      if (!this.iframe.contentWindow) {
        console.warn("[IframeMessengerAdapter] Cannot post message: iframe contentWindow not accessible.");
        return;
      }
      try {
        this.iframe.contentWindow.postMessage(e, this.targetOrigin);
      } catch (t) {
        console.error("[IframeMessengerAdapter] Failed to postMessage to iframe:", t);
      }
    }
  }
  /**
   * Pushes initial data and configuration down to the widget.
   */
  sendLoadContent(e, t) {
    this.post({
      type: c.LOAD_CONTENT,
      payload: {
        content: e,
        config: t
      }
    });
  }
  /**
   * Sends synchronization acknowledgement back to the widget.
   */
  sendSyncAck(e, t) {
    this.post({
      type: c.SYNC_ACK,
      msgId: e,
      payload: {
        serverHash: t,
        success: !0
      }
    });
  }
  /**
   * Subscribes to events emitted by the widget.
   */
  onMessage(e) {
    this.isLockedDown || this.handlers.add(e);
  }
  /**
   * Permanently severs the connection to the widget during fatal error states.
   */
  lockdown() {
    if (!this.isLockedDown) {
      try {
        this.post({
          type: c.ERROR_LOCKDOWN,
          payload: { message: "Connection severed due to fatal sync error." }
        });
      } catch {
      }
      this.isLockedDown = !0, this.handlers.clear(), this.messageListener && (window.removeEventListener("message", this.messageListener), this.messageListener = null);
    }
  }
}
class v {
  constructor(e) {
    a(this, "element");
    a(this, "handlers", /* @__PURE__ */ new Set());
    a(this, "isLockedDown", !1);
    a(this, "cleanupFns", []);
    if (!e || !(e instanceof HTMLElement))
      throw new Error("DOMEventMessengerAdapter requires a valid HTMLElement.");
    this.element = e, this.setupListeners();
  }
  setupListeners() {
    const e = (r, n) => {
      const i = (o) => {
        if (this.isLockedDown) return;
        const d = o.detail || {}, g = d.payload !== void 0 ? d.payload : d, h = d.msgId || d.payload && d.payload.msgId;
        this.handlers.forEach((u) => {
          try {
            u(n, g, h);
          } catch (w) {
            console.error(`[DOMEventMessengerAdapter] Error handling ${r}:`, w);
          }
        });
      };
      this.element.addEventListener(r, i), this.cleanupFns.push(() => this.element.removeEventListener(r, i));
    };
    e("widget:request-content", c.REQUEST_CONTENT), e("widget:sync-content", c.SYNC_CONTENT), e("widget:sync-height", c.SYNC_HEIGHT);
    const t = (r) => {
      if (this.isLockedDown) return;
      const n = r;
      if (n.detail && n.detail.type) {
        const { type: i, payload: o, msgId: l } = n.detail;
        this.handlers.forEach((d) => {
          try {
            d(i, o, l);
          } catch (g) {
            console.error("[DOMEventMessengerAdapter] Error handling widget:message:", g);
          }
        });
      }
    };
    this.element.addEventListener("widget:message", t), this.cleanupFns.push(() => this.element.removeEventListener("widget:message", t));
  }
  /**
   * Pushes initial data and configuration down to the web component.
   */
  sendLoadContent(e, t) {
    this.isLockedDown || this.element.dispatchEvent(
      new CustomEvent("widget:load-content", {
        detail: { content: e, config: t },
        bubbles: !0,
        composed: !0
      })
    );
  }
  /**
   * Confirms a successful save back to the web component.
   */
  sendSyncAck(e, t) {
    this.isLockedDown || this.element.dispatchEvent(
      new CustomEvent("widget:sync-ack", {
        detail: { msgId: e, serverHash: t, success: !0 },
        bubbles: !0,
        composed: !0
      })
    );
  }
  /**
   * Subscribes to events emitted by the widget.
   */
  onMessage(e) {
    this.isLockedDown || this.handlers.add(e);
  }
  /**
   * Permanently severs the connection to the widget during fatal error states.
   */
  lockdown() {
    if (!this.isLockedDown) {
      try {
        this.element.dispatchEvent(
          new CustomEvent("widget:lockdown", {
            detail: { message: "Connection severed due to fatal sync error." },
            bubbles: !0,
            composed: !0
          })
        );
      } catch {
      }
      this.isLockedDown = !0, this.handlers.clear();
      for (const e of this.cleanupFns)
        e();
      this.cleanupFns = [];
    }
  }
}
function m(s, e) {
  var u;
  const t = (s == null ? void 0 : s.getAttribute("data-run-mode")) || ((u = document.body) == null ? void 0 : u.getAttribute("data-run-mode"));
  if (t === "edit" || t === "attempt" || t === "grade" || t === "review")
    return t;
  const r = typeof window < "u" && window.location ? window.location.href : "", n = typeof window < "u" && window.location ? window.location.pathname : "", i = typeof window < "u" && window.location ? window.location.search : "";
  if (n.includes("/question/question.php") || n.includes("/question/bank/editquestion/") || r.includes("/question/question.php") || r.includes("/question/bank/editquestion/"))
    return "edit";
  const o = (n.includes("/mod/quiz/report.php") || r.includes("/mod/quiz/report.php")) && i.includes("mode=grading"), l = (s == null ? void 0 : s.closest(".que, .form-item, form, body")) || document.body, d = !!(l != null && l.querySelector(
    ".comment-area, .gradingform, .qtype_essay_response_form, .commenttext"
  ));
  if (o || d)
    return "grade";
  const g = n.includes("/mod/quiz/review.php") || r.includes("/mod/quiz/review.php"), h = (e == null ? void 0 : e.readOnly) || (e == null ? void 0 : e.disabled) || (e == null ? void 0 : e.getAttribute("aria-disabled")) === "true" || (s == null ? void 0 : s.getAttribute("data-readonly")) === "true";
  return g || h && !o && !d ? "review" : "attempt";
}
class T {
  constructor(e, t, r, n = {}) {
    a(this, "mountPoint");
    a(this, "storage");
    a(this, "messenger");
    a(this, "config");
    a(this, "isErrorState", !1);
    a(this, "widgetTarget", null);
    var l, d;
    if (!e || !(e instanceof HTMLElement))
      throw new Error("WidgetController requires a valid mount point HTMLElement.");
    this.mountPoint = e, this.storage = t, this.messenger = r, this.widgetTarget = this.mountPoint.querySelector("iframe, [data-widget-embedded]") || this.mountPoint.firstElementChild || this.mountPoint;
    const i = n.runMode || ((l = n.config) == null ? void 0 : l.runMode) || m(this.mountPoint), o = ((d = n.config) == null ? void 0 : d.isReadOnly) !== void 0 ? n.config.isReadOnly : this.storage.isReadOnly() || i === "review" || this.mountPoint.hasAttribute("data-readonly") || this.mountPoint.getAttribute("data-readonly") === "true";
    this.config = {
      isReadOnly: o,
      runMode: i,
      defaultCellType: this.mountPoint.getAttribute("data-default-cell-type") || void 0,
      disableInsertAll: this.mountPoint.getAttribute("data-disable-insert-all") === "true",
      ...n.config
    }, this.init();
  }
  /**
   * Updates runtime configuration and pushes updated state to widget.
   */
  updateConfig(e) {
    this.config = { ...this.config, ...e }, this.messenger.sendLoadContent(this.storage.load(), this.config);
  }
  getConfig() {
    return this.config;
  }
  init() {
    this.cleanupPlaceholderUI(), this.setupMessengerListeners();
    const e = this.storage.load();
    this.messenger.sendLoadContent(e, this.config);
  }
  /**
   * Cleans up any loading indicators or placeholder UI within the mount point.
   */
  cleanupPlaceholderUI() {
    this.mountPoint.querySelectorAll(
      ".widget-placeholder, .widget-loading, [data-widget-placeholder]"
    ).forEach((t) => t.remove());
  }
  /**
   * Subscribes to events coming from the widget via the messenger adapter.
   */
  setupMessengerListeners() {
    this.messenger.onMessage((e, t, r) => {
      if (!this.isErrorState)
        switch (e) {
          case c.REQUEST_CONTENT: {
            const n = this.storage.load();
            this.messenger.sendLoadContent(n, this.config);
            break;
          }
          case c.SYNC_CONTENT: {
            this.handleSyncContent(t, r);
            break;
          }
          case c.SYNC_HEIGHT: {
            this.handleSyncHeight(t);
            break;
          }
        }
    });
  }
  /**
   * Handles incoming SYNC_CONTENT messages from the widget.
   */
  handleSyncContent(e, t) {
    let r = "", n = t || "";
    if (typeof e == "string" ? r = e : e && typeof e == "object" && (r = typeof e.content == "string" ? e.content : JSON.stringify(e.content ?? e), !n && e.msgId && (n = e.msgId)), this.storage.save(r)) {
      const o = this.computeHash(r);
      this.messenger.sendSyncAck(n, o);
    } else
      console.error("[WidgetController] Storage save returned false. Triggering Fatal Error State."), this.triggerErrorState("Host rejected the write or storage verification failed.");
  }
  /**
   * Handles height synchronization from widgets to eliminate scrollbars.
   */
  handleSyncHeight(e) {
    const t = typeof e == "number" ? e : e == null ? void 0 : e.height;
    typeof t == "number" && t > 0 && this.widgetTarget && this.widgetTarget instanceof HTMLIFrameElement && (this.widgetTarget.style.height = `${t}px`);
  }
  /**
   * Computes a quick hash of the saved content for sync acknowledgement.
   */
  computeHash(e) {
    let t = 0;
    for (let r = 0; r < e.length; r++)
      t = (t << 5) - t + e.charCodeAt(r), t |= 0;
    return Math.abs(t).toString(16);
  }
  /**
   * Triggers the Fail-Fast Error State:
   * 1. Calls messenger.lockdown()
   * 2. Blurs and disables pointer events on the widget container
   * 3. Injects a prominent red warning banner
   */
  triggerErrorState(e) {
    if (this.isErrorState) return;
    this.isErrorState = !0, this.messenger.lockdown();
    const t = this.widgetTarget || this.mountPoint;
    t.style.pointerEvents = "none", t.style.filter = "blur(2px)", t.style.opacity = "0.3", t.style.userSelect = "none", getComputedStyle(this.mountPoint).position === "static" && (this.mountPoint.style.position = "relative"), this.injectErrorBanner(e);
  }
  /**
   * Injects the red warning banner over the blurred widget.
   */
  injectErrorBanner(e) {
    if (this.mountPoint.querySelector(".widget-fatal-error-banner")) return;
    const r = document.createElement("div");
    r.className = "widget-fatal-error-banner", r.setAttribute("role", "alert"), r.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: #b71c1c;
      color: #ffffff;
      padding: 20px 28px;
      border-radius: 8px;
      border: 2px solid #ef5350;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 90%;
      min-width: 280px;
    `, r.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
        <span style="font-size: 24px; margin-right: 8px;">⚠️</span>
        <strong style="font-size: 17px; letter-spacing: 0.3px;">LMS Connection Lost / Save Failed</strong>
      </div>
      <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.4; color: #ffebee;">
        Your progress could not be saved to the LMS. Typing has been locked to prevent data loss.
        ${e ? `<br><span style="font-size: 12px; opacity: 0.85;">(${e})</span>` : ""}
      </p>
      <button type="button" class="widget-reload-btn" style="
        background-color: #ffffff;
        color: #b71c1c;
        border: none;
        padding: 8px 18px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease;
      ">
        Reload Page
      </button>
    `;
    const n = r.querySelector(".widget-reload-btn");
    n && n.addEventListener("click", () => {
      window.location.reload();
    }), this.mountPoint.appendChild(r);
  }
  getIsErrorState() {
    return this.isErrorState;
  }
}
const S = [];
function L(s) {
  const e = s.getAttribute("data-target-textarea") || s.getAttribute("data-target") || s.getAttribute("data-textarea-selector");
  if (e) {
    const i = document.querySelector(e);
    if (i instanceof HTMLTextAreaElement)
      return i;
  }
  const t = s.getAttribute("data-textarea-name");
  if (t) {
    const i = document.querySelector(`textarea[name="${t}"]`);
    if (i instanceof HTMLTextAreaElement)
      return i;
  }
  const n = (s.closest(".que, .form-item, .fitem, .felement, form, body") || document.body).querySelector("textarea");
  return n instanceof HTMLTextAreaElement ? n : null;
}
function f(s, e) {
  s.innerHTML = "", s.style.position = "relative";
  const t = document.createElement("div");
  t.className = "widget-collision-error-banner", t.setAttribute("role", "alert"), t.style.cssText = `
    background-color: #b71c1c;
    color: #ffffff;
    padding: 16px 20px;
    border-radius: 6px;
    border: 2px solid #ef5350;
    margin: 10px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
  `, t.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 6px;">
      <span style="font-size: 20px; margin-right: 8px;">⛔</span>
      <strong style="font-size: 16px;">Fail-Fast Collision Error</strong>
    </div>
    <p style="margin: 0;">${e}</p>
  `, s.appendChild(t);
}
function p() {
  const s = document.querySelectorAll(
    ".widget-mount-point:not([data-widget-initialized])"
  ), e = [];
  return s.forEach((t) => {
    const r = L(t);
    if (!r) {
      console.error(
        "[LMS Widget Manager] Bootstrapper could not find target textarea for mount point:",
        t
      ), f(t, "Target LMS textarea could not be located for this widget."), t.setAttribute("data-widget-initialized", "error");
      return;
    }
    if (r.getAttribute("data-widget-bound") === "true") {
      console.error(
        "[LMS Widget Manager] Collision detected: Multiple widgets bound to same box!",
        r
      ), f(
        t,
        "Multiple widgets bound to same box. Initialization aborted to prevent data corruption."
      ), t.setAttribute("data-widget-initialized", "error");
      return;
    }
    r.setAttribute("data-widget-bound", "true"), t.setAttribute("data-widget-initialized", "true");
    const n = new E(r);
    let i = null;
    const o = t.querySelector("iframe");
    if (o)
      i = new x(o);
    else {
      const h = Array.from(t.querySelectorAll("*")).find((u) => u.tagName.includes("-"));
      h && (i = new v(h));
    }
    if (!i) {
      console.error(
        "[LMS Widget Manager] No supported widget element (iframe or custom element) found in mount point:",
        t
      ), f(
        t,
        "No valid widget transport found (expected <iframe> or Custom Element with hyphen)."
      );
      return;
    }
    const l = m(t, r), d = new T(t, n, i, { runMode: l });
    e.push(d), S.push(d);
  }), e;
}
typeof window < "u" && typeof document < "u" && (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => {
  p();
}) : p());
export {
  v as DOMEventMessengerAdapter,
  x as IframeMessengerAdapter,
  E as MoodleTextareaAdapter,
  v as WebComponentMessengerAdapter,
  T as WidgetController,
  c as WidgetMessageTypes,
  S as activeControllers,
  p as bootstrap,
  m as sniffMoodleContext
};
//# sourceMappingURL=lms-widget-manager.es.js.map
