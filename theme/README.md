# Liquid Glass — Obsidian カスタムテーマ

Obsidian デフォルトテーマの上に「ガラスの面」だけを上書きするカスタムテーマです。
タイトルバー・リボン・サイドバー・タブ・本文・ステータスバー・ダイアログを、
ぼかしの効いた半透明の角丸パネルとして塗り直します。それ以外（フォントサイズ、
行間、寸法、ウィンドウ操作、リサイズ機能など）は既定の挙動をそのまま残します。

---

## インストール

1. ボルトの `.obsidian/themes/Liquid Glass/` フォルダを作る
2. `theme.css` / `manifest.json` / `versions.json` をそこにコピーする
3. Obsidian → 設定 → 外観 → テーマ で「Liquid Glass」を選ぶ

### 注意

- 設定 → 外観 の **「半透明のウィンドウ」はオフ推奨**。オンにすると OS のウィンドウ透過と
  このテーマの壁紙（`body` の背景）が競合します。
- フォント（`--font-*` / `--line-height-*`）と寸法（`--header-height` / `--ribbon-width` /
  `--divider-width` など）は触っていません。
- ウィンドウの操作ボタン、ペインのリサイズは既定どおり動きます。
- ウィンドウの移動は次の 2 か所でできます。① 既定どおりタブバーの**空き部分**（タブと
  タブの間や右側の余白）、② パネルの外側の**上端のすき間**（メインのノートブロックの
  上の背景）。タブを多く開いても ② があるので移動しやすいです。すき間を広げたい場合は
  Style Settings の「すき間（gap）」を大きくしてください（その分ドラッグ領域も広がります）。

---

## ファイル

| ファイル | 役割 |
|---|---|
| `theme.css` | テーマ本体。デフォルトテーマに重ねる上書きだけを書いた 1 枚もの |
| `manifest.json` | テーマ名・バージョン・最低対応バージョン |
| `versions.json` | バージョンと最低対応 Obsidian の対応表 |

---

## カスタマイズ

### Style Settings プラグイン経由（おすすめ）

[Style Settings](https://github.com/mgmeyers/obsidian-style-settings) を入れておくと、
設定 → Style Settings → Liquid Glass から次を調整できます。

| 項目 | 対応する変数 | 既定 |
|---|---|---|
| 背景のぼかし | `--lg-blur` | `24px` |
| 背景の彩度 | `--lg-saturate` | `180%` |
| パネル同士のすき間 | `--lg-gap` | `10px` |
| サイドバー等の透過度 | `--lg-chrome-alpha` | `0.44` |
| 本文・ダイアログの透過度 | `--lg-surface-alpha` | `0.62` |
| 角丸の大きさ | `--lg-radius-scale` | `1` |
| 角のカーブ | `--corner-shape` | `squircle` |
| 壁紙をオフにする | クラス `lg-no-wallpaper` | オフ |
| 壁紙に画像を使う | `--lg-wallpaper-photo` | `none` |

### CSS 変数を直接いじる / CSS スニペットで上書きする

数値はすべて `body` の CSS 変数に集約してあります。スニペットなどで `body { … }` を
書けば上書きできます。

```css
/* 例: ぼかしを弱めて省電力にする */
body { --lg-blur: 12px; }

/* 例: 壁紙を自作のグラデーションにする（丸ごと差し替え） */
body {
  --lg-wallpaper: linear-gradient(160deg, #101528 0%, #05060c 100%);
}

/* 例: 壁紙に写真を敷く（--lg-wallpaper の上に重なります） */
body {
  --lg-wallpaper-photo: url("https://example.com/bg.jpg");
}
```

#### 壁紙まわり

- 壁紙は `body` の `background-image: var(--lg-wallpaper)` として描かれます（固定）。
- `--lg-wallpaper-photo` に `url(...)` を入れると、`body::before` の画像レイヤーが
  メッシュの上に重なります。写真を使うときは「壁紙をオフにする」と併用すると
  すっきりします（下地のグラデーションを消して写真だけにできます）。
- 壁紙を完全に消したいときは `lg-no-wallpaper` クラス（Style Settings のトグル）か、
  `body { --lg-wallpaper: none }` を使ってください。

#### 色（tint）

ダーク／ライトで非対称にならないよう、tint の色そのものは Style Settings には
出していません。変えたい場合は `--lg-chrome-color` / `--lg-surface-color`（ベース色）と
`--lg-chrome-alpha` / `--lg-surface-alpha`（不透明度）を上書きしてください。

---

## 設計メモ

- **上書き専用**。Obsidian のデフォルトテーマ（`app.css`）は必ず先に読み込まれるので、
  ここでは差分だけを書いています。
- できるだけ Obsidian 自身の CSS 変数を置き換える形にし、`!important` は
  「塗りを奪う」箇所（パネル背景・タブのアクティブなリム・`.cm-*` など）に限定しています。
- 角丸は Obsidian の `--radius-*` を置き換えることで、アプリ全体に一括で効かせています。
- `corner-shape: squircle` は未対応エンジンでは宣言ごと無視され、通常の円弧になります。
- モバイル（`body.is-mobile`）では `--lg-gap: 0` にして、全画面の角丸・`overflow: hidden` を
  当てないようにしています（画面端の UI を切らないため）。
- **左サイドバーの開閉ボタン**：既定ではリボン（左端のアイコン列＝設定などがある
  箱）の左上に浮いて見え、パネルを浮かせるこのテーマではレールの外に出てしまい
  ます。そこでリボンに `position: relative` を与えてボタンの基準をリボン自身にし、
  レールの上端をタブバー行の高さまで伸ばして、ボタンをレールの先頭行に収めて
  います（アイコン列の位置は既定と同じに保っています）。
  なおリボン本体の class は Obsidian のバージョンにより `mod-left`（旧）と
  `mod-primary`（新）があるため、セレクタは両方を並べて書いています。片方だけだと
  ルールが当たらず、ボタンがリボンの外（ウィンドウ左上）に浮いたままになります。
- **ウィンドウ操作ボタン（最小化／最大化／閉じる）**：Windows / Linux の隠しフレーム表示では
  Obsidian 自身が `.titlebar-button` を描画します（OS のオーバーレイではないので CSS が効きます）。
  既定は高さ 39px の横長ボタンなので、12px の丸に置き換えて、パネルのさらに上
  （上端に確保した帯＝`--lg-btn-strip`、既定 14px）の右寄せに並べています。パネルとは
  重なりません（`--lg-top-gap = --lg-gap + --lg-btn-strip` を上端だけに足している）。
  色は macOS 準拠（最小化=黄 / 最大化=緑 / 閉じる=赤、縁は少し濃い同色）、アイコンは
  普段は隠してホバー時だけ薄く出します。ボタン用に空ける幅 `--frame-right-space` も丸の
  大きさに合わせて詰めています。サイズや色は `--lg-btn-*` で調整できます。
- **ウィンドウのドラッグ領域**：枠なし（Windows / Linux の hidden frameless）では既定の
  `.titlebar` が `pointer-events: none` で消え、移動はタブバーの空き部分に頼ることになり
  ます。タブを多く開くと狭いため、`body::after` に高さ `--lg-top-gap`（上端の帯）の透明な帯を置き、
  `-webkit-app-region: drag` を与えています（パネルの外側＝上端のすき間）。
  左・下辺はドラッグにせず（リサイズを妨げないため）、`z-index` もパネル・モーダルより
  下にしています。`--lg-gap` を 0 にすると帯は消え、既定のタブバー移動だけになります。
   右端は `--lg-ctrl-reserve` ぶん空けています。ウィンドウ操作ボタンがこの帯と重なると、
   Electron がクリックをドラッグ操作として吸ってしまいボタンが押せなくなるためです。

### 検証方法

スクリーンショットが使えない環境のため、`preview.html` / `preview-overlays.html` を
ブラウザで開き、`getComputedStyle` / `getBoundingClientRect` の値で確認しています
（パネルの透過・ぼかし、タブのピル化、フォントが既定のままか、ドラッグ領域、
リサイズハンドルのヒットエリアなど）。
