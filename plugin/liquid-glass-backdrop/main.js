/* =============================================================================
   Liquid Glass — Backdrop
   -----------------------------------------------------------------------------
   ポップアウト（別ウィンドウ）だけを「背後のウィンドウ／デスクトップが透ける」
   状態にする小さなローカルプラグインです。メインウィンドウはテーマ既定の
   不透明な見た目のまま、一切変えません。

   ── なぜプラグインが必要か ────────────────────────────────────────────────
   ウィンドウ自身を透かすには Electron の win.setOpacity() / setBackgroundMaterial()
   を JS から呼ぶ必要があり、CSS では不可能です（CSS が触れるのはページの中だけで、
   ウィンドウの外＝背後のウィンドウ／デスクトップには届きません）。Obsidian は
   ポップアウトを不透明で生成し、素材も当てません。既存プラグイン
   （Translucent BG / Pseudo Mica）は「自分が動いているウィンドウ＝メイン」に
   1回だけ当てる実装なので、ポップアウトには効きません。

   ── 透け方の作り方は2通りしかない（OS の制約） ────────────────────────────
   ・frost … OS の背景素材（Acrylic）を当てる。背後がぼける。ぼかし量は OS が
             決めていて弱くできない（＝「ぼかしが強い」ならこの方式は捨てる）
   ・clear … 素材を使わない。ウィンドウ全体を薄く（setOpacity）するので、背後が
             **ぼけずにそのまま**見える。透け具合は数字1つで決まる

   つまり「ぼけを弱くする」ことはできないので、ぼけが強すぎるときは素材を捨てて
   clear を使う。既定は clear。

   ── 機能要件 ──────────────────────────────────────────────────────────────
   R1 ポップアウトに見た目（LOOK）を当てる。clear = 不透明度 / frost = 背景素材
   R2 当てるタイミング: 有効化時 / 新規ウィンドウ生成直後（数回リトライ）/
       前面に来たとき / 保険で1.5秒ごと
   R3 frost のときだけ body に is-translucent を付ける（テーマが不透明な下地を
       外す合図。約12秒ごとに再確認）。clear のときは逆に**外す**（残っていると
       素材が見えてしまうため）
   R4 frost のときは --workspace-background-translucent / --titlebar-background* を
       透明に（Obsidian 自身が敷く60%の膜を止める）
   R5 メインウィンドウには一切書き込まない
   R6 無効化したら、ポップアウトだけ元に戻す（不透明度 1 / 素材 none / クラス除去）
   R7 設定はこのファイル冒頭の定数

   やらないこと: ウィンドウの角丸・影・形の変更（OS 領域）、メインウィンドウの
   半透明化、ぼかし量そのものの変更（OS 依存）、Obsidian 本体設定の変更。
   ========================================================================== */

const { Plugin } = require("obsidian");

/* --- 設定 (R7) ------------------------------------------------------------ */

/* ポップアウトの見せ方。
     'clear'  … 素材を使わず、ウィンドウを薄くして背後をそのまま見せる（既定）
     'frost'  … OS の背景素材（Acrylic）で背後をぼかす
     'custom' … 下の MATERIAL / OPACITY / SHOW_MATERIAL を直接使う */
const LOOK = "clear";

/* 見せ方ごとの値。 (R1) */
const LOOKS = {
  /* ぼけなし。背後がそのまま見える。透け具合は opacity だけ。
     0.75 は「薄いガラス」。大きくすれば読みやすく、小さくすれば透ける。 */
  clear: { material: "none", opacity: 0.75, showMaterial: false },
  /* OS のぼかし。透け具合は最大だが、ぼかしの強さは選べない。 */
  frost: { material: "acrylic", opacity: 1, showMaterial: true }
};

/* --- 'custom' のときだけ使う値 -------------------------------------------- */

/* 背景素材。'auto' / 'acrylic' / 'mica' / 'tabbed' / 'none'。
     'acrylic' … 背後のウィンドウをぼかす
     'auto'    … OS に任せる（Windows 11 では Mica 系）
     'mica'    … デスクトップの壁紙を写す（ぼかしは弱い）
     'tabbed'  … タブ付きタイトルバー相当
     'none'    … 素材なし */
const MATERIAL = "none";

/* ウィンドウ全体の濃さ。1 = そのまま（不透明）。小さいほど透ける。
     0.9 = 控えめ / 0.75 = clear と同じ / 0.6 = かなり
   文字も同じ割合で薄くなるので、0.6 を切ると読みにくくなります。 */
const OPACITY = 0.75;

/* 素材を見せるか。true にすると body に is-translucent を付けて、テーマの
   不透明な下地を外す（＝素材／背後がそのまま見える）。 */
const SHOW_MATERIAL = false;

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

/* --- ポップアウトのページで流すスクリプト ---------------------------------- */

/* frost: 下地を外して素材を見せる（冪等）。 (R3)(R4) */
const PAGE_SCRIPT = [
  "document.body.classList.add('is-translucent');",
  "document.body.style.setProperty('--workspace-background-translucent','transparent');",
  "document.body.style.setProperty('--titlebar-background','transparent');",
  "document.body.style.setProperty('--titlebar-background-focused','transparent');",
  "true"
].join("");

/* すでに付いているかの確認。 (R3) */
const PAGE_CHECK = "document.body.classList.contains('is-translucent')";

/* clear / 無効化時: 下地を元に戻す。clear では「残っていると素材が見える」ので
   これも能動的に流す。 (R3)(R6) */
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

    /* 'custom' なら個別の定数、それ以外はプリセット。 (R1)(R7) */
    this.look =
      LOOKS[LOOK] ||
      {
        material: MATERIAL,
        opacity: OPACITY,
        showMaterial: SHOW_MATERIAL
      };

    this.prepared = new Set(); /* ページ側の処理が済んだウィンドウ id */
    this.focusHooked = new Set(); /* フォーカス時に当て直すフックを張った id */
    this.ticks = 0;

    if (DEBUG) console.info("[liquid-glass-backdrop] look", LOOK, this.look);

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
      this.applyWindow(win); /* (R1)(R2) */
      this.hookFocus(win); /* (R2c) */
      if (verifyPages || !this.prepared.has(win.id)) this.preparePage(win); /* (R3)(R4) */
    }
    /* 閉じたウィンドウの記録を掃除（id が再利用されても確認し直せるように） */
    for (const id of Array.from(this.prepared)) {
      if (!alive.has(id)) this.prepared.delete(id);
    }
  }

  /* 素材と濃さを当てる。 (R1)(R2) */
  applyWindow(win) {
    try {
      win.setBackgroundMaterial(this.look.material);
      if (DEBUG) console.info("[liquid-glass-backdrop] material -> #" + win.id);
    } catch (e) {
      /* 対応していない Windows では無視 (N2) */
    }
    if (this.look.opacity !== 1) {
      try {
        win.setOpacity(this.look.opacity);
      } catch (e) {
        /* 無視 (N2) */
      }
    }
  }

  /* ページ側。frost なら is-translucent を付け、clear なら外す（冪等）。 (R3) */
  preparePage(win) {
    const want = this.look.showMaterial;
    const check = this.run(win, PAGE_CHECK);
    if (!check || typeof check.then !== "function") {
      this.prepared.add(win.id); /* 確認できない環境では諦める (N2) */
      return;
    }
    check
      .then((has) => {
        if (has !== want) {
          this.run(win, want ? PAGE_SCRIPT : UNDO_SCRIPT);
          if (DEBUG) {
            console.info(
              "[liquid-glass-backdrop] is-translucent " + (want ? "on" : "off") + " -> #" + win.id
            );
          }
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
