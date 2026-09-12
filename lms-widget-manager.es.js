var v = Object.defineProperty;
var C = (n, e, t) => e in n ? v(n, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[e] = t;
var c = (n, e, t) => C(n, typeof e != "symbol" ? e + "" : e, t);
class b {
  constructor(e, t = {}) {
    c(this, "textarea");
    c(this, "storageKey");
    c(this, "observer", null);
    c(this, "disconnectCallbacks", []);
    var r;
    if (!e || ((r = e.tagName) == null ? void 0 : r.toLowerCase()) !== "textarea")
      throw new Error("MoodleTextareaAdapter requires a valid HTMLTextAreaElement.");
    this.textarea = e, this.storageKey = this.generateStorageKey(), t.hideTextarea !== !1 && !this.textarea.hasAttribute("data-lms-widget-show-answerbox") && this.hideTextarea(), this.setupDomWatcher();
  }
  /**
   * Visually hides the Moodle textarea while preserving its presence in the form for submission.
   */
  hideTextarea() {
    this.textarea.style.position = "absolute", this.textarea.style.left = "-9999px", this.textarea.style.opacity = "0", this.textarea.style.pointerEvents = "none", this.textarea.setAttribute("tabindex", "-1"), this.textarea.setAttribute("aria-hidden", "true");
  }
  /**
   * Restores the visual visibility of the Moodle textarea (for debugging and live inspection).
   */
  showTextarea() {
    this.textarea.style.position = "", this.textarea.style.left = "", this.textarea.style.opacity = "", this.textarea.style.pointerEvents = "", this.textarea.removeAttribute("tabindex"), this.textarea.removeAttribute("aria-hidden");
  }
  /**
   * Checks if the textarea is currently attached and connected to the live DOM.
   */
  isAttached() {
    if (!this.textarea) return !1;
    if (typeof this.textarea.isConnected == "boolean")
      return this.textarea.isConnected;
    const e = this.textarea.ownerDocument || (typeof document < "u" ? document : null);
    return !!(e && e.contains && e.contains(this.textarea));
  }
  /**
   * Proactively monitors the DOM to detect if the target textarea is deleted.
   */
  setupDomWatcher() {
    var s;
    const e = this.textarea.ownerDocument && ((s = this.textarea.ownerDocument.defaultView) == null ? void 0 : s.MutationObserver) || (typeof MutationObserver < "u" ? MutationObserver : null);
    if (!e) return;
    this.observer = new e(() => {
      this.isAttached() || (this.notifyDisconnect(), this.observer && (this.observer.disconnect(), this.observer = null));
    });
    const t = this.textarea.parentNode || this.textarea.ownerDocument && this.textarea.ownerDocument.body;
    t && this.observer.observe(t, { childList: !0, subtree: !0 });
  }
  onDisconnect(e) {
    if (this.disconnectCallbacks.push(e), !this.isAttached())
      try {
        e();
      } catch (t) {
        console.error("[MoodleTextareaAdapter] Error in disconnect callback:", t);
      }
  }
  notifyDisconnect() {
    if (this.disconnectCallbacks.length === 0) return;
    const e = [...this.disconnectCallbacks];
    this.disconnectCallbacks = [], e.forEach((t) => {
      try {
        t();
      } catch (s) {
        console.error("[MoodleTextareaAdapter] Error in disconnect callback:", s);
      }
    });
  }
  /**
   * Generates a stable unique hash identifier for this textarea based on location and identifier.
   */
  generateStorageKey() {
    const e = typeof window < "u" && window.location ? window.location.origin : "host", t = typeof window < "u" && window.location ? window.location.pathname : "", s = this.textarea.name || this.textarea.id || "unnamed-box", r = `${e}${t}#${s}`;
    let a = 0;
    for (let o = 0; o < r.length; o++) {
      const l = r.charCodeAt(o);
      a = (a << 5) - a + l, a |= 0;
    }
    return `lms_widget_backup_${Math.abs(a).toString(36)}`;
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
        if (t && t.trim().length > 0) {
          let s = t;
          try {
            const r = JSON.parse(t);
            r && typeof r == "object" && typeof r.content == "string" && (s = r.content);
          } catch {
          }
          if (s && s.trim().length > 0)
            return this.textarea.value = s, this.dispatchChangeEvents(), s;
        }
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
    if (!this.isAttached())
      return console.error("[MoodleTextareaAdapter] Cannot save: Target textarea is detached or deleted from the DOM."), this.notifyDisconnect(), !1;
    if (this.isReadOnly())
      return console.warn("[MoodleTextareaAdapter] Cannot save: Host textarea is read-only or disabled."), !1;
    try {
      if (this.textarea.value = e, this.dispatchChangeEvents(), typeof window < "u" && window.localStorage)
        try {
          const s = JSON.stringify({
            content: e,
            timestamp: Date.now()
          });
          window.localStorage.setItem(this.storageKey, s);
        } catch (s) {
          console.warn("[MoodleTextareaAdapter] LocalStorage backup write failed:", s);
        }
      const t = this.isAttached() && this.textarea.value === e;
      return t || (console.error("[MoodleTextareaAdapter] Verification failed: textarea value does not match content or element detached."), this.notifyDisconnect()), t;
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
  /**
   * Cleans up local storage backups that are older than maxAgeDays.
   */
  static garbageCollect(e = 14) {
    if (typeof window > "u" || !window.localStorage) return;
    const t = e * 24 * 60 * 60 * 1e3, s = Date.now(), r = [];
    for (let a = 0; a < window.localStorage.length; a++) {
      const o = window.localStorage.key(a);
      if (o && o.startsWith("lms_widget_backup_"))
        try {
          const l = window.localStorage.getItem(o);
          if (l) {
            const i = JSON.parse(l);
            i && typeof i == "object" && i.timestamp ? s - i.timestamp > t && r.push(o) : r.push(o);
          }
        } catch {
          r.push(o);
        }
    }
    for (const a of r)
      window.localStorage.removeItem(a);
  }
  /**
   * Cleanup lifecycle method to unbind event listeners and prevent memory leaks.
   */
  destroy() {
    this.observer && (this.observer.disconnect(), this.observer = null), this.disconnectCallbacks = [];
  }
}
const g = {
  REQUEST_CONTENT: "REQUEST_CONTENT",
  SYNC_CONTENT: "SYNC_CONTENT",
  SYNC_HEIGHT: "SYNC_HEIGHT",
  LOAD_CONTENT: "LOAD_CONTENT",
  SYNC_ACK: "SYNC_ACK",
  ERROR_LOCKDOWN: "ERROR_LOCKDOWN"
};
class S {
  constructor(e, t = "*") {
    c(this, "iframe");
    c(this, "targetOrigin");
    c(this, "handlers", /* @__PURE__ */ new Set());
    c(this, "isLockedDown", !1);
    c(this, "messageListener", null);
    var s;
    if (!e || ((s = e.tagName) == null ? void 0 : s.toLowerCase()) !== "iframe")
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
      const { type: s, payload: r, msgId: a } = t;
      typeof s == "string" && this.handlers.forEach((o) => {
        try {
          o(s, r, a);
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
      type: g.LOAD_CONTENT,
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
      type: g.SYNC_ACK,
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
          type: g.ERROR_LOCKDOWN,
          payload: { message: "Connection severed due to fatal sync error." }
        });
      } catch {
      }
      this.isLockedDown = !0, this.handlers.clear(), this.messageListener && (window.removeEventListener("message", this.messageListener), this.messageListener = null);
    }
  }
  /**
   * Cleanup lifecycle method to unbind event listeners and prevent memory leaks.
   */
  destroy() {
    this.handlers.clear(), this.messageListener && (window.removeEventListener("message", this.messageListener), this.messageListener = null);
  }
}
class A {
  constructor(e) {
    c(this, "element");
    c(this, "handlers", /* @__PURE__ */ new Set());
    c(this, "isLockedDown", !1);
    c(this, "cleanupFns", []);
    if (!e || e.nodeType !== 1)
      throw new Error("DOMEventMessengerAdapter requires a valid HTMLElement.");
    this.element = e, this.setupListeners();
  }
  setupListeners() {
    const e = (s, r) => {
      const a = (o) => {
        if (this.isLockedDown) return;
        const i = o.detail || {}, d = i.payload !== void 0 ? i.payload : i, f = i.msgId || i.payload && i.payload.msgId;
        this.handlers.forEach((h) => {
          try {
            h(r, d, f);
          } catch (u) {
            console.error(`[DOMEventMessengerAdapter] Error handling ${s}:`, u);
          }
        });
      };
      this.element.addEventListener(s, a), this.cleanupFns.push(() => this.element.removeEventListener(s, a));
    };
    e("widget:request-content", g.REQUEST_CONTENT), e("lms-widget:request-content", g.REQUEST_CONTENT), e("widget:sync-content", g.SYNC_CONTENT), e("lms-widget:sync-content", g.SYNC_CONTENT), e("widget:sync-height", g.SYNC_HEIGHT), e("lms-widget:sync-height", g.SYNC_HEIGHT);
    const t = (s) => {
      if (this.isLockedDown) return;
      const r = s;
      if (r.detail && r.detail.type) {
        const { type: a, payload: o, msgId: l } = r.detail;
        this.handlers.forEach((i) => {
          try {
            i(a, o, l);
          } catch (d) {
            console.error("[DOMEventMessengerAdapter] Error handling generic message:", d);
          }
        });
      }
    };
    this.element.addEventListener("widget:message", t), this.element.addEventListener("lms-widget:message", t), this.cleanupFns.push(() => {
      this.element.removeEventListener("widget:message", t), this.element.removeEventListener("lms-widget:message", t);
    });
  }
  /**
   * Pushes initial data and configuration down to the web component.
   * Emits both host:load-content (Host-to-Guest protocol) and widget:load-content.
   */
  sendLoadContent(e, t) {
    if (this.isLockedDown) return;
    const s = { content: e, payload: e, config: t };
    this.element.dispatchEvent(
      new CustomEvent("host:load-content", {
        detail: s,
        bubbles: !0,
        composed: !0
      })
    ), this.element.dispatchEvent(
      new CustomEvent("widget:load-content", {
        detail: s,
        bubbles: !0,
        composed: !0
      })
    );
  }
  /**
   * Confirms a successful save back to the web component.
   */
  sendSyncAck(e, t) {
    if (this.isLockedDown) return;
    const s = { msgId: e, serverHash: t, hash: t, success: !0 };
    this.element.dispatchEvent(
      new CustomEvent("host:sync-ack", {
        detail: s,
        bubbles: !0,
        composed: !0
      })
    ), this.element.dispatchEvent(
      new CustomEvent("widget:sync-ack", {
        detail: s,
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
        const e = { message: "Connection severed due to fatal sync error." };
        this.element.dispatchEvent(
          new CustomEvent("host:lockdown", {
            detail: e,
            bubbles: !0,
            composed: !0
          })
        ), this.element.dispatchEvent(
          new CustomEvent("widget:lockdown", {
            detail: e,
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
  /**
   * Cleanup lifecycle method to unbind event listeners and prevent memory leaks.
   */
  destroy() {
    this.handlers.clear();
    for (const e of this.cleanupFns)
      e();
    this.cleanupFns = [];
  }
}
function E(n, e) {
  var h;
  const t = (n == null ? void 0 : n.getAttribute("data-run-mode")) || ((h = document.body) == null ? void 0 : h.getAttribute("data-run-mode"));
  if (t === "edit" || t === "attempt" || t === "grade" || t === "review")
    return t;
  const s = typeof window < "u" && window.location ? window.location.href : "", r = typeof window < "u" && window.location ? window.location.pathname : "", a = typeof window < "u" && window.location ? window.location.search : "";
  if (r.includes("/question/question.php") || r.includes("/question/bank/editquestion/") || s.includes("/question/question.php") || s.includes("/question/bank/editquestion/"))
    return "edit";
  const o = (r.includes("/mod/quiz/report.php") || s.includes("/mod/quiz/report.php")) && a.includes("mode=grading"), l = (n == null ? void 0 : n.closest(".que, .form-item, form, body")) || document.body, i = !!(l != null && l.querySelector(
    ".comment-area, .gradingform, .qtype_essay_response_form, .commenttext"
  ));
  if (o || i)
    return "grade";
  const d = r.includes("/mod/quiz/review.php") || s.includes("/mod/quiz/review.php"), f = (e == null ? void 0 : e.readOnly) || (e == null ? void 0 : e.disabled) || (e == null ? void 0 : e.getAttribute("aria-disabled")) === "true" || (n == null ? void 0 : n.getAttribute("data-readonly")) === "true";
  return d || f && !o && !i ? "review" : "attempt";
}
class T {
  constructor(e, t, s, r = {}) {
    c(this, "mountPoint");
    c(this, "storage");
    c(this, "messenger");
    c(this, "config");
    c(this, "isErrorState", !1);
    c(this, "widgetTarget", null);
    var l, i;
    if (!e || e.nodeType !== 1)
      throw new Error("WidgetController requires a valid mount point HTMLElement.");
    this.mountPoint = e, this.storage = t, this.messenger = s, this.widgetTarget = this.mountPoint.querySelector("[data-lms-widget]") || this.mountPoint.querySelector("iframe, [data-widget-embedded]") || this.mountPoint.firstElementChild || this.mountPoint;
    const a = r.runMode || ((l = r.config) == null ? void 0 : l.runMode) || E(this.mountPoint), o = ((i = r.config) == null ? void 0 : i.isReadOnly) !== void 0 ? r.config.isReadOnly : this.storage.isReadOnly() || a === "review" || this.mountPoint.hasAttribute("data-readonly") || this.mountPoint.getAttribute("data-readonly") === "true";
    this.config = {
      isReadOnly: o,
      runMode: a,
      defaultCellType: this.mountPoint.getAttribute("data-default-cell-type") || void 0,
      disableInsertAll: this.mountPoint.getAttribute("data-disable-insert-all") === "true",
      ...r.config
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
    this.messenger.sendLoadContent(e, this.config), this.storage.onDisconnect && this.storage.onDisconnect(() => {
      this.isErrorState || (console.error("[WidgetController] Target LMS textarea was disconnected or removed from the DOM. Triggering Fatal Error State."), this.triggerErrorState("Target LMS answerbox was removed or disconnected from the DOM."));
    });
  }
  /**
   * Cleans up any loading indicators or placeholder UI within the mount point.
   */
  cleanupPlaceholderUI() {
    this.mountPoint.querySelectorAll(
      ".lms-widget-placeholder, .widget-placeholder, .widget-loading, [data-lms-widget-placeholder], [data-widget-placeholder]"
    ).forEach((t) => t.remove());
  }
  /**
   * Subscribes to events coming from the widget via the messenger adapter.
   */
  setupMessengerListeners() {
    this.messenger.onMessage((e, t, s) => {
      if (!this.isErrorState)
        switch (e) {
          case g.REQUEST_CONTENT: {
            const r = this.storage.load();
            this.messenger.sendLoadContent(r, this.config);
            break;
          }
          case g.SYNC_CONTENT: {
            this.handleSyncContent(t, s);
            break;
          }
          case g.SYNC_HEIGHT: {
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
    let s = "", r = t || "";
    if (typeof e == "string" ? s = e : e && typeof e == "object" && (s = typeof e.content == "string" ? e.content : JSON.stringify(e.content ?? e), !r && e.msgId && (r = e.msgId)), this.storage.save(s)) {
      const o = this.computeHash(s);
      this.messenger.sendSyncAck(r, o);
    } else {
      console.error("[WidgetController] Storage save returned false. Triggering Fatal Error State.");
      const o = !this.storage.isAttached || this.storage.isAttached() ? "Host rejected the write or storage verification failed." : "Target LMS answerbox was removed or disconnected from the DOM.";
      this.triggerErrorState(o);
    }
  }
  /**
   * Handles height synchronization from widgets to eliminate scrollbars.
   */
  handleSyncHeight(e) {
    var s;
    const t = typeof e == "number" ? e : e == null ? void 0 : e.height;
    typeof t == "number" && t > 0 && this.widgetTarget && ((s = this.widgetTarget.tagName) == null ? void 0 : s.toLowerCase()) === "iframe" && (this.widgetTarget.style.height = `${t}px`);
  }
  /**
   * Computes a quick hash of the saved content for sync acknowledgement.
   */
  computeHash(e) {
    let t = 0;
    for (let s = 0; s < e.length; s++)
      t = (t << 5) - t + e.charCodeAt(s), t |= 0;
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
    if (this.mountPoint.querySelector(
      ".lms-widget-fatal-error-banner, .widget-fatal-error-banner"
    )) return;
    const s = document.createElement("div");
    s.className = "lms-widget-fatal-error-banner widget-fatal-error-banner", s.setAttribute("role", "alert"), s.style.cssText = `
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
    `, s.innerHTML = `
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
    const r = s.querySelector(".widget-reload-btn");
    r && r.addEventListener("click", () => {
      window.location.reload();
    }), this.mountPoint.appendChild(s);
  }
  getIsErrorState() {
    return this.isErrorState;
  }
  /**
   * Cleanup lifecycle method to tear down the controller and its adapters.
   */
  destroy() {
    this.storage.destroy && this.storage.destroy(), this.messenger.destroy && this.messenger.destroy();
  }
}
const m = [];
function L(n) {
  var o, l, i;
  const e = n.getAttribute("data-lms-target-textarea") || n.getAttribute("data-target-textarea") || n.getAttribute("data-target") || n.getAttribute("data-lms-textarea-selector") || n.getAttribute("data-textarea-selector");
  if (e) {
    const d = document.querySelector(e);
    if (d && ((o = d.tagName) == null ? void 0 : o.toLowerCase()) === "textarea")
      return d;
  }
  const t = n.getAttribute("data-lms-textarea-name") || n.getAttribute("data-textarea-name");
  if (t) {
    const d = document.querySelector(`textarea[name="${t}"]`);
    if (d && ((l = d.tagName) == null ? void 0 : l.toLowerCase()) === "textarea")
      return d;
  }
  const s = n.closest(".que, .form-item, .fitem, .felement, form, body") || document.body, a = Array.from(s.querySelectorAll("textarea")).find((d) => !n.contains(d));
  return a && ((i = a.tagName) == null ? void 0 : i.toLowerCase()) === "textarea" ? a : null;
}
function y(n, e) {
  n.innerHTML = "", n.style.position = "relative";
  const t = document.createElement("div");
  t.className = "lms-widget-collision-banner widget-collision-error-banner", t.setAttribute("role", "alert"), t.style.cssText = `
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
      <strong style="font-size: 16px;">LMS Widget Fail-Fast Collision Error</strong>
    </div>
    <p style="margin: 0;">${e}</p>
  `, n.appendChild(t);
}
function x() {
  b.garbageCollect(14);
  const n = document.querySelectorAll(
    ".lms-widget-container:not([data-lms-widget-initialized]):not([data-widget-initialized]), .widget-mount-point:not([data-lms-widget-initialized]):not([data-widget-initialized])"
  ), e = [];
  return n.forEach((t) => {
    const s = L(t);
    if (!s) {
      console.error(
        "[LMS Widget Manager] Bootstrapper could not find target textarea for container:",
        t
      ), y(t, "Target LMS textarea could not be located for this widget."), t.setAttribute("data-lms-widget-initialized", "error"), t.setAttribute("data-widget-initialized", "error");
      return;
    }
    if (s.getAttribute("data-lms-widget-bound") === "true" || s.getAttribute("data-widget-bound") === "true") {
      console.error(
        "[LMS Widget Manager] Collision detected: Multiple widgets bound to same box!",
        s
      ), y(
        t,
        "Multiple widgets bound to same box. Initialization aborted to prevent data corruption."
      ), t.setAttribute("data-lms-widget-initialized", "error"), t.setAttribute("data-widget-initialized", "error");
      return;
    }
    s.setAttribute("data-lms-widget-bound", "true"), s.setAttribute("data-widget-bound", "true"), t.setAttribute("data-lms-widget-initialized", "true"), t.setAttribute("data-widget-initialized", "true");
    const r = t.querySelector("[data-lms-widget]"), a = t.hasAttribute("data-lms-widget-show-answerbox") || s.hasAttribute("data-lms-widget-show-answerbox") || (r == null ? void 0 : r.hasAttribute("data-lms-widget-show-answerbox")), o = new b(s, {
      hideTextarea: !a
    }), l = () => {
      var f;
      let i = null;
      const d = t.querySelector("[data-lms-widget]");
      if (d)
        if (d.hasAttribute("data-lms-widget-show-answerbox") && ((f = o.showTextarea) == null || f.call(o)), d.tagName.toLowerCase() === "iframe") {
          let h = "*";
          const u = d.getAttribute("data-lms-widget-origin") || t.getAttribute("data-lms-widget-origin");
          if (u)
            h = u;
          else if (d.hasAttribute("src"))
            try {
              h = new URL(d.getAttribute("src") || "", window.location.href).origin;
            } catch {
            }
          i = new S(d, h);
        } else
          i = new A(d);
      if (i) {
        const h = E(t, s), u = new T(t, o, i, { runMode: h }), p = u.destroy.bind(u);
        return u.destroy = () => {
          p();
          const w = m.indexOf(u);
          w > -1 && m.splice(w, 1);
        }, e.push(u), m.push(u), !0;
      }
      return !1;
    };
    if (!l()) {
      let i = t.querySelector(
        ".lms-widget-placeholder, .widget-placeholder, [data-lms-widget-placeholder]"
      );
      i ? i.innerHTML = "Loading answer box..." : (i = document.createElement("div"), i.className = "lms-widget-placeholder widget-placeholder", i.innerHTML = "Loading answer box...", i.style.cssText = "padding: 20px; text-align: center; color: #64748b; font-family: sans-serif; font-size: 14px;", t.appendChild(i)), new MutationObserver((f, h) => {
        l() && (h.disconnect(), i && i.parentNode && i.parentNode.removeChild(i));
      }).observe(t, { childList: !0, subtree: !0 });
    }
  }), e;
}
typeof window < "u" && typeof document < "u" && (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => {
  x();
}) : x());
export {
  A as DOMEventMessengerAdapter,
  S as IframeMessengerAdapter,
  b as MoodleTextareaAdapter,
  A as WebComponentMessengerAdapter,
  T as WidgetController,
  g as WidgetMessageTypes,
  m as activeControllers,
  x as bootstrap,
  E as sniffMoodleContext
};
//# sourceMappingURL=lms-widget-manager.es.js.map
