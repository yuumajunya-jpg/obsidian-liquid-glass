/* =============================================================================
   Liquid Glass — Backdrop
   -----------------------------------------------------------------------------
   ポップアウト（別ウィンドウ）だけを薄く（半透明に）する小さなローカル
   プラグインです。メインウィンドウには一切書き込みません。

   ── なぜプラグインが必要か ────────────────────────────────────────────────
   ウィンドウ自身を透かすには Electron の win.setOpacity() を JS から呼ぶ必要が
   あり、CSS では不可能です（CSS が触れるのはページの中だけで、ウィンドウの外＝
   背後のウィンドウ／デスクトップには届きません）。

   ── 透明にできる条件 ──────────────────────────────────────────────────────
   ここで使う setOpacity は「ページ」ではなく「ウィンドウ」の属性なので、
     ・ウィンドウが生成された後であればよい（生成前に当てることはできない）
     ・ページの読み込み完了は待たなくてよい
     ・1回当てれば確定する（再適用・保険ループは不要）
   したがって適用のタイミングは次の2つだけです。

   ── 機能要件 ──────────────────────────────────────────────────────────────
   R1 メイン以外のウィンドウを OPACITY にする
   R2 適用は「有効化時」と「'window-open' のとき」の2回だけ（タイマーなし）
   R3 メインウィンドウには一切書き込みません
   R4 無効化したら、メイン以外のウィンドウを元（不透明度 1）に戻す
   R5 設定はこのファイル冒頭の定数

   やらないこと: OS の背景素材（Acrylic / Mica）の適用、ページ側のクラス操作、
   タイマーによる再適用、ウィンドウの角丸・影・形の変更、メインの半透明化。
   ========================================================================== */

const { Plugin } = require("obsidian");

/* --- 設定 (R5) ------------------------------------------------------------ */

/* ポップアウトの濃さ。1 = そのまま（不透明）。小さいほど透ける。
     0.9 = 控えめ / 0.75 = 既定 / 0.6 = かなり
   文字も同じ割合で薄くなるので、0.6 を切ると読みにくくなります。 */
const OPACITY = 0.75;

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

    /* このプラグインが動いているウィンドウ＝メインウィンドウ。 (R3) */
    this.mainWindowId = this.detectMainWindowId();
    if (this.mainWindowId === null) {
      console.warn(
        "[liquid-glass-backdrop] メインウィンドウを特定できません。安全のため何もしません。"
      );
      return;
    }

    this.apply(); /* (R1)(R2) 有効化時に開いているポップアウト */

    /* 新しく開いたポップアウト。この時点でウィンドウは生成済み。 (R2) */
    this.registerEvent(this.app.workspace.on("window-open", () => this.apply()));
  }

  onunload() {
    for (const win of this.targets()) {
      try {
        win.setOpacity(1);
      } catch (e) {
        /* 非対応環境では無視 */
      }
    }
  } /* (R4) */

  /* --- 内部 --------------------------------------------------------------- */

  loadRemote() {
    try {
      const req = typeof require === "function" ? require : window.require;
      return req("@electron/remote");
    } catch (e) {
      return null;
    }
  }

  /* プラグイン自身のウィンドウをメインとみなす。特定できなければ null。 (R3) */
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

  /* 触ってよいウィンドウ＝メイン以外（ポップアウト）。 (R3) */
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

  /* メイン以外のウィンドウを薄くする（冪等・1回で確定）。 (R1) */
  apply() {
    for (const win of this.targets()) {
      try {
        win.setOpacity(OPACITY);
      } catch (e) {
        /* 無視 */
      }
    }
  }
};
