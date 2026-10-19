/* =============================================================================
   Liquid Glass — Backdrop
   -----------------------------------------------------------------------------
   ポップアウト（別ウィンドウ）だけを「背後のウィンドウ／デスクトップが透ける」
   状態にする小さなローカルプラグインです。メインウィンドウはテーマ既定の
   不透明な見た目のまま、一切変えません。

   ── なぜプラグインが必要か ────────────────────────────────────────────────
   ウィンドウの背景を OS の素材（Acrylic / Mica）にするには Electron の
   win.setBackgroundMaterial() を JS から呼ぶ必要があり、CSS では不可能です。
   Obsidian はポップアウトを不透明で生成し、素材は当てません。既存プラグイン
   （Translucent BG / Pseudo Mica）は「自分が動いているウィンドウ＝メイン」に
   1回だけ当てる実装なので、ポップアウトには効きません。

   実験で分かった2つの条件:
     ・素材は「ウィンドウが出来た後」に当てる必要がある
       （生成前に当てても効かない。既存ポップアウトへ後から1回だけでも効かなかった）
     ・ページ側の body.is-translucent（テーマが下地を外す合図）は1回で足りる

   ── 機能要件 ──────────────────────────────────────────────────────────────
   R1 ポップアウトに setBackgroundMaterial(MATERIAL) を当てる（既定 acrylic）
   R2 当てるタイミング: 有効化時 / 新規ウィンドウ生成直後（数回リトライ）/
      前面に来たとき / 保険で1.5秒ごと
   R3 ポップアウトの body に is-translucent を付ける（不足時のみ。約12秒ごとに再確認）
   R4 ポップアウトの --workspace-background-translucent / --titlebar-background* を
      透明に（Obsidian 自身が敷く60%の膜を止める）
   R5 メインウィンドウには一切書き込まない
   R6 無効化したら、ポップアウトだけ元に戻す
   R7 設定はこのファイル冒頭の定数
   R8 濃さ（OPACITY）もつまみとして出す。素材のぼかしは弱くできないので、
      ぼけが強すぎるときはここを 1 未満にして「ぼけていない背景」を混ぜる

   やらないこと: ウィンドウの角丸・影・形の変更（OS 領域）、メインウィンドウの
   半透明化、ぼかし量そのものの変更（OS 依存。OPACITY とテーマ側の膜で調整する）、
   Obsidian 本体設定の変更。
   ========================================================================== */

const { Plugin } = require("obsidian");

/* --- 設定 (R7) ------------------------------------------------------------ */

/* 適用する背景素材。'auto' / 'acrylic' / 'mica' / 'tabbed' / 'none'。
     'acrylic' … 背後のウィンドウをぼかす（ポップアウト向き・既定）
     'auto'    … OS に任せる（Windows 11 では Mica 系になる）
     'mica'    … デスクトップの壁紙を写す（ぼかしは弱い）
     'tabbed'  … タブ付きタイトルバー相当
     'none'    … 素材なし */
const MATERIAL = "acrylic";

/* ポップアウトの濃さ。1 = そのまま（素材のぼかしがそのまま出る）。
   素材のぼかし量は OS 固定で弱くできないため、「ぼけが強すぎる」ときのつまみは
   これと、テーマ側の膜（--lg-popout-veil）の2つ。
   1 未満にすると、ぼけた素材の上に「ぼけていない背景」が (1 - OPACITY) の割合で
   乗るので、ぼけの主張が弱くなる。副作用として文字も同じ割合で薄くなる
   （0.9 以上なら実用範囲 / 0.8 を切ると読みにくい）。 */
const OPACITY = 1;

/* メインウィンドウもこのプラグインに任せるか。既定 false＝メインは触らない (R5)。 */
const INCLUDE_MAIN_WINDOW = false;

/* 新しいウィンドウに当てるタイミング（ms）。生成直後の1回は無視されることがある。 (R2b) */
const OPEN_RETRY_DELAYS = [0, 250, 750, 2000];

/* 保険の当て直し間隔（ms）。 (R2d) */
const SAFETY_INTERVAL_MS = 1500;

/* 保険ループ何回に1回、ページ側（is-translucent など）を再確認するか。 (R3)
   8 × 1.5 秒 ＝ 約12秒。 */
const PAGE_RECHECK_EVERY = 8;

/* 動作確認用のログを出すか。 */
const DEBUG = false;

/* --- 実際に流すスクリプト -------------------------------------------------- */

/* ポップアウトの document で実行する内容（冪等）。 (R3)(R4) */
const PAGE_SCRIPT = [
  "document.body.classList.add('is-translucent');",
  "document.body.style.setProperty('--workspace-background-translucent','transparent');",
  "document.body.style.setProperty('--titlebar-background','transparent');",
  "document.body.style.setProperty('--titlebar-background-focused','transparent');",
  "true"
].join("");

/* すでに付いているかの確認。 (R3) */
const PAGE_CHECK = "document.body.classList.contains('is-translucent')";

/* 無効化時の巻き戻し。 (R6) */
const UNDO_SCRIPT = [
  "document.body.classList.remove('is-translucent');",
  "['--workspace-background-translucent','--titlebar-background','--titlebar-background-focused']",
  ".forEach(n => document.body.style.removeProperty(n));",
  "true"
].join("");

/* ========================================================================== */

module.exports = class LiquidGlassBackdrop extends Plugin {
  onload() {
    this.remote = this.loadRemote();
    if (!this.remote) {
      console.warn(
        "[liquid-glass-backdrop] @electron/remote を読み込めません。デスクトップ版 Obsidian でのみ動作します。何もしません。"
      );
      return;
    }

    /* このプラグインが動いているウィンドウ＝メインウィンドウ。 (R5) */
    this.mainWindowId = this.detectMainWindowId();
    if (this.mainWindowId === null && !INCLUDE_MAIN_WINDOW) {
      console.warn(
        "[liquid-glass-backdrop] メインウィンドウを特定できません。安全のため何もしません。"
      );
      return;
    }

    this.prepared = new Set(); /* ページ側の処理が済んだウィンドウ id */
    this.focusHooked = new Set(); /* フォーカス時に当て直すフックを張った id */
    this.ticks = 0;

    this.applyAll(true); /* (R2a) 有効化時に開いているポップアウト */
    this.timer = setInterval(() => this.tick(), SAFETY_INTERVAL_MS); /* (R2d) */

    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        OPEN_RETRY_DELAYS.forEach((delay) =>
          setTimeout(() => this.applyAll(true), delay)
        );
      })
    ); /* (R2b) */
  }

  onunload() {
    clearInterval(this.timer);
    for (const win of this.targets()) {
      try {
        win.setBackgroundMaterial("none");
      } catch (e) {
        /* 非対応環境では無視 */
      }
      try {
        win.setOpacity(1);
      } catch (e) {
        /* 非対応環境では無視 */
      }
      this.run(win, UNDO_SCRIPT);
    }
  } /* (R6) */

  /* --- 内部 --------------------------------------------------------------- */

  loadRemote() {
    try {
      const req = typeof require === "function" ? require : window.require;
      const remote = req("@electron/remote");
      return remote && remote.BrowserWindow ? remote : null;
    } catch (e) {
      return null; /* (N2) */
    }
  }

  /* プラグイン自身のウィンドウをメインとみなす。特定できなければ null。 (R5)(N1) */
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

  /* 触ってよいウィンドウ＝メイン以外（ポップアウト）。 (R5) */
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
      /* メインを特定できていないときは、安全側で誰も触らない。 (N1) */
      if (typeof this.mainWindowId !== "number") return false;
      return win.id !== this.mainWindowId;
    });
  }

  run(win, script) {
    try {
      return win.webContents.executeJavaScript(script);
    } catch (e) {
      return null; /* (N2) */
    }
  }

  tick() {
    this.ticks += 1;
    this.applyAll(this.ticks % PAGE_RECHECK_EVERY === 0);
  }

  /* 全てのポップアウトに当てる。verifyPages が真ならページ側も確認し直す。 */
  applyAll(verifyPages) {
    const alive = new Set();
    for (const win of this.targets()) {
      alive.add(win.id);
      this.applyWindow(win); /* (R1)(R2)(R8) */
      this.hookFocus(win); /* (R2c) */
      if (verifyPages || !this.prepared.has(win.id)) this.preparePage(win); /* (R3)(R4) */
    }
    /* 閉じたウィンドウの記録を掃除（id が再利用されても確認し直せるように） */
    for (const id of Array.from(this.prepared)) {
      if (!alive.has(id)) this.prepared.delete(id);
    }
  }

  /* 素材と濃さを当てる。 (R1)(R2)(R8) */
  applyWindow(win) {
    try {
      win.setBackgroundMaterial(MATERIAL);
      if (DEBUG) console.info("[liquid-glass-backdrop] material -> #" + win.id);
    } catch (e) {
      /* 対応していない Windows では無視 (N2) */
    }
    if (OPACITY !== 1) {
      try {
        win.setOpacity(OPACITY);
      } catch (e) {
        /* 無視 (N2) */
      }
    }
  }

  /* ページ側。付いていなければ付けるだけ（1回で足りる）。 */
  preparePage(win) {
    const check = this.run(win, PAGE_CHECK);
    if (!check || typeof check.then !== "function") {
      this.prepared.add(win.id); /* 確認できない環境では諦める (N2) */
      return;
    }
    check
      .then((has) => {
        if (!has) {
          this.run(win, PAGE_SCRIPT);
          if (DEBUG) console.info("[liquid-glass-backdrop] is-translucent -> #" + win.id);
        }
        this.prepared.add(win.id);
      })
      .catch(() => {
        this.prepared.add(win.id);
      });
  }

  hookFocus(win) {
    if (this.focusHooked.has(win.id)) return;
    this.focusHooked.add(win.id);
    try {
      win.on("focus", () => this.applyWindow(win)); /* (R2c) */
    } catch (e) {
      /* 張れない環境では保険の当て直しが担当 (N2) */
    }
  }
};
