# obsidian-liquid-glass

Obsidian のデフォルトテーマを iOS 26 の **Liquid Glass**（すりガラス／フローティング）風に
改変するプロジェクトです。かつての試作 CSS を、Obsidian の**カスタムテーマ**
（`theme.css` + `manifest.json`）として正式にまとめ直しました。

テーマ本体は `theme/` の中にあります。詳しい使い方は `theme/README.md` を参照してください。

---

## ファイル一覧

| ファイル | 役割 | サイズ目安 |
|---|---|---|
| `theme/theme.css` | **テーマ本体（現行）**。デフォルトテーマに重ねる上書きだけを 1 枚にまとめたもの | 約24KB |
| `theme/manifest.json` | テーマ名・バージョン・最低対応バージョン | 約0.2KB |
| `theme/versions.json` | バージョンと最低対応 Obsidian の対応表 | — |
| `theme/README.md` | テーマのインストール / カスタマイズ / 設計メモ | — |
| `app.css` | Obsidian 本体から抽出した**元のCSSそのまま**。PDF.js のCSS + Obsidian デフォルトテーマの合成物。加工はしていない | 約586KB |
| `obsidian-default.css` | `app.css` から **Obsidian デフォルトテーマ部分だけ** を切り出したもの。改修対象の土台 | 約550KB |
| `liquid-glass.css` | **旧試作（レガシー）**。`theme/theme.css` に置き換わった。参照用に残置 | 約20KB |
| `preview.html` | 確認用モック。メイン画面（リボン / サイドバー / エディタ / タブ / ステータスバー）。`theme/theme.css` を読み込む | 約9KB |
| `preview-overlays.html` | 確認用モック。オーバーレイ系（モーダル / コマンドパレット / メニュー / トグル / 引用 / コールアウト）。`theme/theme.css` を読み込む | 約7KB |
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

> 設定 → 外観 の **「半透明のウィンドウ」はオフ推奨**（OS の透過と壁紙が競合します）。

### CSSスニペットとして当てる（手軽に試す用）
1. ボルトの `.obsidian/snippets/` に `theme/theme.css` を `liquid-glass.css` 等の
   名前でコピーする
2. Obsidian → 設定 → 外観 → 「CSSスニペット」で有効化

---

## 現状のメモ

- ダークテーマを主軸に調整。ライトテーマ（`.theme-light`）も対応済み
- スクリーンショット環境が使えないため、確認はブラウザの `getComputedStyle` /
  `getBoundingClientRect` の値ベース（プレビュー目視も併用）
