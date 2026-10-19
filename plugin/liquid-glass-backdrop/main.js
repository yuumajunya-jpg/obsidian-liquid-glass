/* =============================================================================
   Liquid Glass — Backdrop （ローカル補助プラグイン）
   -----------------------------------------------------------------------------
   ポップアウト（別ウィンドウ）に Windows の背景素材を当てて、テーマ
   「Liquid Glass」の半透明表示をポップアウトでも有効にするための小さな
   プラグインです。

   メインウィンドウは担当しません。メインは既存のプラグイン
   （Translucent BG / Pseudo Mica など）とテーマに任せる、という切り分けです。
   （INCLUDE_MAIN_WINDOW を true にすればメインもこのプラグインが担当します。
     その場合は他プラグインをオフにしてください。）

   2つの別の層があるので、分けて考えます。
     (A) ウィンドウ側 … setBackgroundMaterial() で OS に素材を描かせる（Electron）
     (B) ページ側     … body に is-translucent を付けて、テーマの透明化を効かせる（CSS）

   (B) は1回付ければ十分です（テーマが不透明な下地を外すだけ）。
   (A) は「ウィンドウが出来た後に当てる」必要があります。生成前に当てても効かず、
   ポップアウトに後から1回だけ当てても効かないケースがありました。
   そのため本プラグインは

     ・起動時に、そのとき開いているポップアウトへ当てる
     ・新しいウィンドウが開いたら、数回に分けて当てる（生成直後は無視されるため）
     ・ウィンドウが前面に来たら当て直す
     ・保険として低頻度で当て直す

   という順で (A) を当て続け、(B) は足りないときだけ付けます。

   素材を変えたいときは、下の MATERIAL を書き換えてください。
     'acrylic' … 背後のウィンドウをぼかす（既定・ポップアウト向き）
     'mica'    … デスクトップの壁紙を写す
     'tabbed'  … タブ付きタイトルバー相当
     'none'    … 素材なし（無効化したいとき）
   ========================================================================== */

const { Plugin } = require("obsidian");

/* 適用する素材。 */
const MATERIAL = "acrylic";

/* メインウィンドウもこのプラグインに任せるか。
   false（既定）＝メインは触らない／ポップアウトだけ担当。 */
const INCLUDE_MAIN_WINDOW = false;

/* 新しいウィンドウに当てるタイミング（ミリ秒）。生成直後の1回は効かないことが
   あるので、少し間隔を空けて数回試します。 */
const WINDOW_OPEN_RETRIES = [0, 250, 750, 2000];

/* 保険の当て直し間隔（ミリ秒）。Obsidian がウィンドウを作り直した場合でも、
   これで最大この間隔までに元に戻ります。 */
const SAFETY_INTERVAL_MS = 1500;

/* 各ウィンドウのページ側で実行する処理（冪等）。 */
const PAGE_SCRIPT =
  "document.body.classList.add('is-translucent');" +
  "document.body.style.setProperty('--workspace-background-translucent','transparent');" +
  "document.body.style.setProperty('--titlebar-background','transparent');" +
  "document.body.style.setProperty('--titlebar-background-focused','transparent');" +
  "true";

/* アンロード時（プラグインを切ったとき）の巻き戻し。 */
const UNDO_SCRIPT =
  "document.body.classList.remove('is-translucent');" +
  "['--workspace-background-translucent','--titlebar-background','--titlebar-background-focused']" +
  ".forEach(n => document.body.style.removeProperty(n));" +
  "true";

module.exports = class LiquidGlassBackdrop extends Plugin {
  onload() {
    this.remote = this.loadRemote();
    if (!this.remote) {
      console.warn(
        "[liquid-glass-backdrop] @electron/remote を読み込めないため、何もしません（デスクトップ版 Obsidian でのみ動作します）。"
      );
      return;
    }

    /* このプラグインが動いているウィンドウ＝メインウィンドウ。
       ここを基準に「それ以外＝ポップアウト」と判定します。 */
    this.mainWindowId = this.detectMainWindowId();
    if (this.mainWindowId === null && !INCLUDE_MAIN_WINDOW) {
      console.warn(
        "[liquid-glass-backdrop] メインウィンドウを特定できませんでした。安全のため何もしません。"
      );
      return;
    }

    this.focusHooked = new Set();

    this.applyAll(); /* 起動時（開いていたポップアウトも含む） */
    this.timer = setInterval(() => this.applyAll(), SAFETY_INTERVAL_MS);

    /* 新しいポップアウトは「出来た後」に当てる。 */
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        WINDOW_OPEN_RETRIES.forEach((delay) =>
          setTimeout(() => this.applyAll(), delay)
        );
      })
    );
  }

  onunload() {
    clearInterval(this.timer);
    for (const win of this.targets()) {
      try {
        win.setBackgroundMaterial("none");
      } catch (e) {
        /* 対応していない環境では無視 */
      }
      this.run(win, UNDO_SCRIPT);
    }
  }

  /* --- 内部 ------------------------------------------------------------- */

  loadRemote() {
    try {
      const req = typeof require === "function" ? require : window.require;
      const remote = req("@electron/remote");
      return remote && remote.BrowserWindow ? remote : null;
    } catch (e) {
      return null;
    }
  }

  detectMainWindowId() {
    try {
      const win = this.remote.getCurrentWindow?.();
      if (win && typeof win.id === "number") return win.id;
    } catch (e) {
      /* 次の方法を試す */
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

  /* 触ってよいウィンドウ（既定ではメイン以外＝ポップアウト）。 */
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
      if (INCLUDE_MAIN_WINDOW) return true;
      return win.id !== this.mainWindowId;
    });
  }

  run(win, script) {
    try {
      return win.webContents.executeJavaScript(script);
    } catch (e) {
      return null;
    }
  }

  applyAll() {
    for (const win of this.targets()) {
      this.applyMaterial(win);
      this.applyPage(win);
      this.hookFocus(win);
    }
  }

  /* (A) OS に素材を描かせる。 */
  applyMaterial(win) {
    try {
      win.setBackgroundMaterial(MATERIAL);
    } catch (e) {
      /* 対応していない Windows では無視 */
    }
  }

  /* (B) テーマの透明化。1回で足りるので、付いていなければ付けるだけ。 */
  applyPage(win) {
    const check = this.run(
      win,
      "document.body.classList.contains('is-translucent')"
    );
    if (check && typeof check.then === "function") {
      check
        .then((has) => {
          if (!has) this.run(win, PAGE_SCRIPT);
        })
        .catch(() => {});
    }
  }

  /* 前面に来たときに当て直す（Obsidian 側で作り直されることがあるため）。 */
  hookFocus(win) {
    if (this.focusHooked.has(win.id)) return;
    this.focusHooked.add(win.id);
    try {
      win.on("focus", () => this.applyMaterial(win));
    } catch (e) {
      /* イベントを張れない環境では無視（保険の当て直しが担当する） */
    }
  }
};
