/* =============================================================================
   Liquid Glass — Backdrop
   -----------------------------------------------------------------------------
   ポップアウト（別ウィンドウ）だけに Windows 11 の Acrylic を適用する
   小さなローカルプラグインです。メインウィンドウには一切書き込みません。

   ── なぜプラグインが必要か ────────────────────────────────────────────────
   ウィンドウの背景素材（Acrylic）は Electron の
   win.setBackgroundMaterial() を JS から呼ぶ必要があり、CSS では不可能です。
   CSS が触れるのはページの中だけで、ウィンドウの外＝背後のウィンドウ／
   デスクトップには届きません。

   ── 機能要件 ──────────────────────────────────────────────────────────────
   R1 メイン以外のウィンドウに Acrylic を適用する
   R2 適用したポップアウトの body に lg-popout-translucent と
      lg-popout-acrylic を付ける（テーマは後者を見て背景を塗らない）
   R3 適用は「有効化時」「window-open」「dom-ready」のみ（タイマーなし）
   R4 メインウィンドウには一切書き込みません
   R5 無効化したら、素材を none に戻し、不透明度を 1 に戻し、クラスを外す
   R6 設定はこのファイル冒頭の定数
   ========================================================================== */

const { Plugin } = require("obsidian");

/* --- 設定 (R6) ------------------------------------------------------------ */

/* Windows 11 22H2 以降でのみ使える Acrylic。
   Electron の setBackgroundMaterial("acrylic") に対応します。
   Obsidian の「ウィンドウ枠のスタイル」は「非表示 / Obsidian フレーム」に
   すると安定します（Pseudo Mica と同じ条件）。 */
const MATERIAL = "acrylic";

/* 透過を適用したことを示す既存の識別用クラス。 */
const FLAG_CLASS = "lg-popout-translucent";

/* Acrylic を適用したことを示すクラス。テーマはこれを見て、
   ポップアウトの背景（壁紙）を塗らず、OS の素材を見せます。 */
const ACRYLIC_CLASS = "lg-popout-acrylic";

/* 動作確認用のログ。 */
const DEBUG = false;

/* --- ポップアウトのページで流すスクリプト -------------------------------- */

const ADD_CLASSES = [
  `document.body.classList.add(${JSON.stringify(FLAG_CLASS)}, ${JSON.stringify(ACRYLIC_CLASS)});`,
  "true"
].join("");

const REMOVE_CLASSES = [
  `document.body.classList.remove(${JSON.stringify(FLAG_CLASS)}, ${JSON.stringify(ACRYLIC_CLASS)});`,
  "true"
].join("");

/* ========================================================================== */

module.exports = class LiquidGlassBackdrop extends Plugin {
  onload() {
    this.pageHooked = new Set();
    this.pageListeners = new Map();
    this.acrylicWindows = new Set();
    this.supported = false;

    this.remote = this.loadRemote();
    if (!this.remote) {
      console.warn(
        "[liquid-glass-backdrop] @electron/remote を読み込めません。デスクトップ版 Obsidian でのみ動作します。何もしません。"
      );
      return;
    }

    /* このプラグインが動いているウィンドウ＝メインウィンドウ。 (R4) */
    this.mainWindowId = this.detectMainWindowId();
    if (this.mainWindowId === null) {
      console.warn(
        "[liquid-glass-backdrop] メインウィンドウを特定できません。安全のため何もしません。"
      );
      return;
    }

    this.supported = this.checkAcrylicSupport();
    if (!this.supported) {
      console.info(
        "[liquid-glass-backdrop] Acrylic は Windows 11 22H2 以降でのみ利用できます。ポップアウトの背景は変更しません。"
      );
    }

    this.applyAll(); /* (R3) 有効化時に開いているポップアウト */

    /* 新しく開いたポップアウト。この時点でウィンドウは生成済み。 (R3) */
    this.registerEvent(this.app.workspace.on("window-open", () => this.applyAll()));
  }

  onunload() {
    /* 先に dom-ready の監視を外す。unload 後にクラスが復活するのを防ぐ。 */
    for (const entry of this.pageListeners.values()) {
      try {
        entry.webContents.removeListener("dom-ready", entry.apply);
      } catch (e) {
        /* 破棄済みなら無視 */
      }
    }
    this.pageListeners.clear();

    for (const win of this.targets()) {
      try {
        win.setOpacity(1);
      } catch (e) {
        /* 非対応環境では無視 */
      }
      try {
        if (typeof win.setBackgroundMaterial === "function") {
          win.setBackgroundMaterial("none");
        }
      } catch (e) {
        /* 非対応環境では無視 */
      }
      this.run(win, REMOVE_CLASSES);
    } /* (R5) */

    this.pageHooked.clear();
    this.acrylicWindows.clear();
  }

  /* --- 内部 --------------------------------------------------------------- */

  loadRemote() {
    try {
      const req = typeof require === "function" ? require : window.require;
      return req("@electron/remote");
    } catch (e) {
      return null;
    }
  }

  /* Windows 11 22H2（build 22621）以降かを確認する。 */
  checkAcrylicSupport() {
    try {
      if (typeof process === "undefined" || process.platform !== "win32") {
        return false;
      }
      const os = require("os");
      const parts = String(os.release()).split(".").map(Number);
      const build = Number(parts[2]);
      return Number.isFinite(build) && build >= 22621;
    } catch (e) {
      return false;
    }
  }

  /* プラグイン自身のウィンドウをメインとみなす。特定できなければ null。 (R4) */
  detectMainWindowId() {
    try {
      const win = this.remote.getCurrentWindow?.();
      if (win && typeof win.id === "number") return win.id;
    } catch (e) {
      /* 次の方法へ */
    }
    try {
      const wc = this.remote.getCurrentWebContents?.();
      const win = wc && this.remote.BrowserWindow.fromWebContents?.(wc);
      if (win && typeof win.id === "number") return win.id;
    } catch (e) {
      /* 特定できず */
    }
    return null;
  }

  /* 触ってよいウィンドウ＝メイン以外（ポップアウト）。 (R4) */
  targets() {
    let all = [];
    try {
      all = this.remote.BrowserWindow.getAllWindows();
    } catch (e) {
      return [];
    }
    return all.filter((win) => {
      try {
        if (typeof win.isDestroyed === "function" && win.isDestroyed()) return false;
      } catch (e) {
        return false;
      }
      /* メインを特定できていないときは、安全側で誰も触らない。 */
      if (typeof this.mainWindowId !== "number") return false;
      return win.id !== this.mainWindowId;
    });
  }

  run(win, script) {
    try {
      const result = win.webContents.executeJavaScript(script);
      if (result && typeof result.catch === "function") result.catch(() => {});
      return result;
    } catch (e) {
      return null;
    }
  }

  applyAll() {
    for (const win of this.targets()) {
      /* 旧バージョンの setOpacity が残っていても、文字が薄くならないように戻す。 */
      try {
        win.setOpacity(1);
      } catch (e) {
        /* 非対応環境では無視 */
      }

      let applied = false;
      if (this.supported) {
        try {
          if (typeof win.setBackgroundMaterial === "function") {
            win.setBackgroundMaterial(MATERIAL); /* (R1) */
            applied = true;
          }
        } catch (e) {
          applied = false;
        }
      }

      if (applied) {
        this.acrylicWindows.add(win.id);
        this.run(win, ADD_CLASSES);
        if (DEBUG) console.info("[liquid-glass-backdrop] acrylic -> #" + win.id);
        this.hookPage(win); /* (R2) */
      } else {
        this.acrylicWindows.delete(win.id);
        this.run(win, REMOVE_CLASSES);
      }
    }
  }

  /* (R2) ページ側のクラス。再読み込みにも dom-ready で追従する。 */
  hookPage(win) {
    if (this.pageHooked.has(win.id)) return;
    this.pageHooked.add(win.id);

    const apply = () =>
      this.run(win, this.acrylicWindows.has(win.id) ? ADD_CLASSES : REMOVE_CLASSES);
    const id = win.id;

    try {
      win.webContents.on("dom-ready", apply);
      this.pageListeners.set(id, { webContents: win.webContents, apply });
      win.once("closed", () => {
        this.pageHooked.delete(id);
        this.pageListeners.delete(id);
        this.acrylicWindows.delete(id);
      });
    } catch (e) {
      /* イベントを張れない環境では即時適用だけ行う */
    }

    /* すでに読み込み済みなら即時。未読み込みなら上の dom-ready が担当する。 */
    apply();
  }
};
