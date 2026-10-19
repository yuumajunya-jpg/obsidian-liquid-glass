# obsidian-liquid-glass

Obsidian のデフォルトテーマを iOS 26 の **Liquid Glass**（すりガラス／フローティング）風に
改変するプロジェクトです。かつての試作 CSS を、Obsidian の**カスタムテーマ**
（`theme.css` + `manifest.json`）として正式にまとめ直しました。

テーマ本体は `theme/` の中にあります。詳しい使い方は `theme/README.md` を参照してください。

---

## ファイル一覧

| ファイル | 役割 | サイズ目安 |
|---|---|---|
| `theme/theme.css` | **テーマ本体（現行）**。デフォルトテーマに重ねる上書きだけを 1 枚にまとめたもの | 約46KB |
| `theme/manifest.json` | テーマ名・バージョン・最低対応バージョン | 約0.2KB |
| `theme/versions.json` | バージョンと最低対応 Obsidian の対応表 | — |
| `theme/README.md` | テーマのインストール / カスタマイズ / 設計メモ | — |
| `plugin/liquid-glass-backdrop/` | 補助プラグイン（任意）。全ウィンドウに Windows の背景素材（Acrylic/Mica）を当てて、ポップアウトも透かす | 約2KB |
| `app.css` | Obsidian 本体から抽出した**元のCSSそのまま**。PDF.js のCSS + Obsidian デフォルトテーマの合成物。加工はしていない | 約586KB |
| `obsidian-default.css` | `app.css` から **Obsidian デフォルトテーマ部分だけ** を切り出したもの。改修対象の土台 | 約550KB |
| `liquid-glass.css` | **旧試作（レガシー）**。`theme/theme.css` に置き換わった。参照用に残置 | 約20KB |
| `preview.html` | 確認用モック。メイン画面（リボン / サイドバー / エディタ / タブ / ステータスバー）。`theme/theme.css` を読み込む。新形式の Obsidian に合わせて `--callout-*` を色として定義している | 約12KB |
| `preview-overlays.html` | 確認用モック。オーバーレイ系（モーダル / コマンドパレット / メニュー / トグル / 引用 / コールアウト）。`theme/theme.css` を読み込む | 約7KB |
| `preview-quotes.html` | 確認用モック。引用ブロックの案の比較（V1 スパイン＝採用 〜 V5 重ねガラス）。テーマのトークンだけで各案を作っている | 約13KB |
| `serve.js` | プレビュー用の簡易ローカルHTTPサーバ（ポート 8787）。`file://` を開けないツール向け | 約1KB |
| `README.md` | このファイル | — |

> `liquid-glass.css` は過去の試作です。今は `theme/theme.css` が唯一の編集対象です。
> デザイントークン（`--lg-*`）の考え方は共通ですが、`theme.css` 側で整理し直しています。

---

## 抽出元（Obsidian デフォルトCSS）

- 実体: `C:\Users\<ユーザー>\AppData\Local\Programs\Obsidian\resources\obsidian.asar` 内の `\app.css`
- asar からの取り出し（要 Node.js）:

  ```powershell
  npx --yes @electron/asar extract-file `
    "$env:LOCALAPPDATA\Programs\Obsidian\resources\obsidian.asar" app.css
  ```

- `app.css` の構成
  - 先頭〜約2,000行 … PDF.js（PDFビューア）のCSS。テーマとは無関係
  - 1,998行目の `/* Obsidian theme variables */` 以降 … Obsidian 本体のデフォルトテーマ
- `obsidian-default.css` は上記のテーマ部分のみを切り出したもの

> Obsidian を更新すると `obsidian.asar` の中身も変わるため、`app.css` /
> `obsidian-default.css` は更新のたびに取り直すのが安全です。

### 注意：バージョン差（コールアウトの色の持ち方）

手元の `app.css` は**抽出した時点のもの**なので、使用中の Obsidian より古いことがあります。
実機で確認したところ（2026-10-17）、使用中の Obsidian は既に新形式でした。

| | 旧形式（手元の `app.css`） | 新形式（実機） |
|---|---|---|
| `--callout-color` | `2, 122, 255`（3つ組） | `#027aff`（色そのもの） |
| 既定の塗り | `rgba(var(--callout-color), 0.1)` | `color-mix(in oklch, var(--callout-color) 10%, transparent)` |
| 有効な書き方 | `rgba(var(--callout-color), α)` | `color-mix(in srgb, var(--callout-color) α%, transparent)` |

**両方を並べて保険にはできません。** `var()` を含む宣言が無効な値になった場合
（invalid at computed-value time）、CSS は「1つ前の宣言に戻る」のではなく
**そのプロパティの値ごと `none`（初期値）にする**ためです。実測:

| 宣言（2つ目が勝つ） | `--callout-color: #00ff00` | `--callout-color: 0,255,0` |
|---|---|---|
| `…linear-gradient(rgba(var(--c), .5), …)` | `none` | `rgba(0,255,0,.5)` |
| `…linear-gradient(color-mix(in srgb, var(--c) 50%, transparent), …)` | `color(0 1 0 / .5)` | `none` |

なので、色を触るルールを書くときは**実機の形式に合わせて1つだけ**書きます
（`preview.html` は新形式を再現するよう `--callout-*` を色に置き換えています）。

---

## `theme/theme.css` の設計メモ

デフォルトテーマを**置き換えず、上書きだけを重ねる**方針です。

- `body` に壁紙（ダーク用／ライト用のメッシュ風グラデーション、任意で画像レイヤー）
- サイドバー・エディタ・リボン・タイトルバー・ステータスバーを
  **すき間を空けたフローティングのガラスパネル**に
  - `backdrop-filter: blur(24px) saturate(180%) brightness(1.06)`
  - 上辺のスペキュラハイライト（`inset 0 1px 0`）+ 1px 輪郭 + 多層シャドウ
- 角丸を全体的に拡大（最大 26px）。`--corner-shape: squircle` で Apple 風の曲線に
  （未対応エンジンでは通常の円弧 `round` になる）
- タブをピル型に変更（既定の「くっつくタブ」装飾の疑似要素を無効化）
- モーダル / コマンドパレット / メニュー / サジェストを濃いめのガラスに
- ファイルツリー選択項目、iOS 風トグル、コードブロック、引用、コールアウトもガラス化
- スクロールバーを細いオーバーレイ表示に
- `backdrop-filter` 非対応環境と `prefers-reduced-transparency` のフォールバック付き

### デフォルト挙動を壊さないための配慮

- フォント（`--font-*` / `--line-height-*`）と寸法（`--header-height` /
  `--ribbon-width` / `--divider-width` / `--file-line-width` など）は触らない
- `.titlebar` の `position` / `-webkit-app-region: drag` は触らない
- ウィンドウ操作ボタン（`.titlebar-button-*`）は消さない・隠さない
- リボンの `margin-top: var(--header-height)` は既定のまま（`0` にすると先頭アイコンが
  ドラッグ領域に重なる）
- ペインのリサイズハンドルは機能維持（すき間ぶんヒットエリアを広げる）
- 入力欄の枠線は「色だけ」差し替える（太さを変えないのでレイアウトがずれない）

### 主な調整ポイント

数値は `body` の CSS 変数に集約してあります（`theme/theme.css` の
「1. デザイントークン」付近）。

| 変数 | 意味 |
|---|---|
| `--lg-gap` | パネル同士のすき間 |
| `--lg-blur` / `--lg-saturate` / `--lg-brightness` | ぼかし・彩度・明度 |
| `--lg-chrome` / `--lg-surface` | サイドバー系 / 本文・ダイアログ系の着色 |
| `--lg-rim-top` / `--lg-rim-outline` | 縁のハイライト / 輪郭線 |
| `--radius-s` 〜 `--radius-xl` | 角丸スケール |
| `--corner-shape` | 角の形状（`squircle` / `round` など） |
| `--lg-wallpaper` / `--lg-wallpaper-photo` | 壁紙（グラデーション / 画像レイヤー） |

`Style Settings` プラグインからも、ぼかし・透過度・角丸などをスライダーで調整できます
（`theme/README.md` を参照）。

---

## プレビューの見方

### そのままブラウザで開く場合
`preview.html` / `preview-overlays.html` をダブルクリックで開けばOKです
（同じフォルダの CSS を相対参照しています）。

### ローカルサーバ経由で開く場合
`file://` を開けないツールから見る場合はサーバを立てます。

```powershell
node serve.js
# → http://localhost:8787/preview.html
#    http://localhost:8787/preview-overlays.html
```

> プレビュー用 HTML の `html { zoom: 0.618; }` とサイドバー幅の指定は、
> 狭いプレビュー枠に 1440px 幅のレイアウトを収めるための**モック専用の調整**です。
> テーマ本体（`theme/theme.css`）には含まれません。

---

## 実機（Obsidian）で試す手順

### カスタムテーマとして当てる（推奨）
1. ボルトの `.obsidian/themes/Liquid Glass/` を作る
2. `theme/theme.css` / `theme/manifest.json` / `theme/versions.json` をコピーする
3. Obsidian → 設定 → 外観 → テーマ で「Liquid Glass」を選ぶ

> ウィンドウ自体を透かしたい場合、テーマ側は `is-translucent` を検知して壁紙を
> 「幽霊壁紙」に差し替えます（`theme/README.md` の「半透明ウィンドウ」参照）。
> ただし**メインウィンドウは既定で不透明のまま**です。透かすのはポップアウトだけで
> 足りるので、Translucent BG / Pseudo Mica のようなプラグインは不要です。

### ポップアウトだけを透かす（補助プラグイン / 任意）
1. ボルトの `.obsidian/plugins/liquid-glass-backdrop/` を作る
2. `plugin/liquid-glass-backdrop/main.js` と `manifest.json` をコピーする
3. Obsidian を再起動 → 設定 → コミュニティプラグイン で「Liquid Glass — Backdrop」を有効化

> このプラグインは**ポップアウト専門**で、メインウィンドウには何も書き込みません。
> Translucent BG / Pseudo Mica は無効化して構いません。

**透け方**

`setOpacity` でウィンドウ全体を薄くするだけです。OS の素材（Acrylic）もぼかしも
使わないので、背後が**ぼけずにそのまま**見えます。透け具合は `main.js` 冒頭の
`OPACITY`（既定 `0.75`）の1つだけで、小さいほど透けます
（`0.9` 控えめ / `0.75` 既定 / `0.6` かなり。文字も同じ割合で薄くなります）。

適用は**有効化時**と**ポップアウトを開いたとき**の2回だけです。タイマーによる再適用は
ありません（`setOpacity` はウィンドウの属性なので1回で確定し、ページの読み込み完了も
待たなくてよいため）。

### CSSスニペットとして当てる（手軽に試す用）
1. ボルトの `.obsidian/snippets/` に `theme/theme.css` を `liquid-glass.css` 等の
   名前でコピーする
2. Obsidian → 設定 → 外観 → 「CSSスニペット」で有効化

---

## 現状のメモ

- ダークテーマを主軸に調整。ライトテーマ（`.theme-light`）も対応済み
- スクリーンショット環境が使えないため、確認はブラウザの `getComputedStyle` /
  `getBoundingClientRect` の値ベース（プレビュー目視も併用）
