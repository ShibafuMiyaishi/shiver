# shiver システムアーキテクチャ（v3.2）

## 全体パイプライン（7フェーズ）

```
[Phase 1: ベース画像生成 (STAGE 1)]
  プロンプト → BaseImageGenerator → SD WebUI+AnythingV5(優先) / Gemini 2.5 Flash(フォールバック)
  → 4枚生成 → ユーザー選択

[Phase 2: マスク生成]
  選択画像 → MediaPipe Face Mesh(478ランドマーク・iris含む)
  → normalized_to_pixel()変換 + compute_bbox_from_landmarks()
  → SAM2(Points+BBox)で17パーツのマスクPNG生成
  → dilate_mask(dilation_px=3)でマスク膨張

[Phase 3: パーツ個別生成 (STAGE 2)]
  ベース画像 + SAM2マスク + パーツ別プロンプト(グリーンバック指定)
  → PartsGenerator(依存グラフ5レイヤー順次実行・レイヤー内並列)
  → Gemini 2.5 Flash Image(実験) / Gemini 3 Pro Image(本番)
  → chroma_key_to_rgba()でグリーンバック除去 → 17パーツ透過PNG

[Phase 4: 手動補正]
  → PartEditor UI → アンカー・位置・サイズ微調整

[Phase 5: リギング]
  各パーツ → PixiJS Sprite配置(zIndex/parallax/anchor設定)
  → hair_*パーツにSpringChain物理演算アタッチ

[Phase 6: リアルタイム駆動]
  requestAnimationFrame(~60fps):
    A. MediaPipe顔追跡 → faceMapper → 適応閾値で個人差吸収
    B. idleAnimator(常時) → 自動まばたき(3-5秒周期) + 呼吸(全体ボビング)
    C. physicsEngine(常時) → 髪揺れ(バネ振り子, head_yaw/pitch入力)
    D. キーバインド表情(割り込み) → パラメータオーバーライド
    E. pixiRenderer → finalParams + 物理演算結果で描画更新

[Phase 7: 出力]
  ブラウザプレビュー(backgroundAlpha:0) → OBSブラウザソース → Virtual Camera → 配信
```

## v3.2 コア設計: 積み上げ方式

### 旧方式（分解方式）の問題
1枚絵をSAM2で切り抜く → 前髪の下の額、左目を覆う横髪の裏側など
「見えていない部分」がマスクから除外されて穴になる（オクルージョン問題）

### 新方式（積み上げ方式）
ベース画像を「参照」として、各パーツをGeminiで個別にインペイント生成。
隠れていた部分もAIが自然に補完する。

### 依存グラフ（GENERATION_LAYERS）
```
LAYER 0: hair_back, blush_left, blush_right    ← 独立、並列
LAYER 1: face                                   ← hair_backの後
LAYER 2: left_white, right_white, nose, mouth,  ← faceの後、並列
          left_brow, right_brow
LAYER 3: left_pupil, right_pupil,               ← white/の後、並列
          left_upper_lid, right_upper_lid
LAYER 4: hair_front, hair_side_left,            ← faceの後、並列
          hair_side_right
```

### 透過処理: グリーンバック方式
- 白背景禁止（白目・白髪が消えるため）
- プロンプトで `#00FF00` グリーンバックを指定
- `chroma_key_to_rgba()`: HSVクロマキー → rembgフォールバック → 手動補正

## 通信アーキテクチャ

```
+-----------------------------------------------------+
| ブラウザ (localhost:5173)                             |
|  React + PixiJS + MediaPipe                          |
|  <-> REST: 画像生成・セグメント・プロジェクト保存     |
|  <-> WebSocket: 顔パラメータストリーム(自動再接続)   |
+-------------------------+---------------------------+
                          |
+-------------------------v---------------------------+
| FastAPI Backend (localhost:8000)                     |
|  routers/ → services/ → 外部API呼び出し             |
|  base_image_generator.py  (STAGE 1)                 |
|  parts_generator.py       (STAGE 2)                 |
|  sam2_service.py           (マスク生成+BBox)         |
+----------+---------------------+--------------------+
           |                     |
+----------v----------+ +-------v---------------------+
| SD WebUI            | | GPU Server (localhost:8001)  |
| (localhost:7860)    | | SAM2 + PyTorch CUDA         |
| ベース画像生成API   | | マスクセグメンテーション     |
+---------------------+ +-----------------------------+
           |
+----------v----------+
| Gemini API (Cloud)  |
| STAGE 1 フォールバック
| STAGE 2 パーツ生成  |
+---------------------+
```

## パーツ構成（17パーツ）

### 顔パーツ
- `face` - 顔全体（前髪下の額も補完）
- `nose` - 鼻
- `mouth` - 口

### 目パーツ（3層 x 左右）
- `left_white` / `right_white` - 白目
- `left_pupil` / `right_pupil` - 瞳（XY追跡対象）
- `left_upper_lid` / `right_upper_lid` - 上まぶた（まばたき対象）

### 眉・頬パーツ
- `left_brow` / `right_brow` - 眉（上下移動）
- `blush_left` / `blush_right` - 頬染め（alpha制御）

### 髪パーツ（物理演算対象）
- `hair_back` - 後ろ髪（stiffness:0.15, maxAngle:18）
- `hair_front` - 前髪（stiffness:0.20, maxAngle:12）
- `hair_side_left` / `hair_side_right` - 横髪（stiffness:0.18, maxAngle:15）

## SAM2 アニメドメインギャップ対策

- Points単独ではアニメ絵の精度が低い（See-through論文の知見）
- `compute_bbox_from_landmarks()` でBBoxを計算し、Points+BBox両方をSAM2に渡す
- 髪パーツは `padding_ratio=0.25`（先端が切れやすい）、その他は `0.15`

## 「生きてる感」の実現方法

| 要素 | 実装 | 常時実行 |
|------|------|---------|
| 自動まばたき | 3-5秒ランダム周期、0.15秒で開閉 | Yes |
| 呼吸 | 4秒周期サインカーブ、全体Y軸ボビング+-3px | Yes |
| 髪揺れ | バネ振り子物理演算、head_yaw/pitch入力 | Yes |
| 瞳追跡 | FaceBlendshapes eyeLookOutLeft等 | 顔検出時 |
| 表情 | キーバインド1-5/q/e、トグル/タイマー | ユーザー操作時 |

## キーバインド表情

| キー | 表情 | 動作 |
|------|------|------|
| 1 | 照れ | 3秒タイマー |
| 2 | 泣き | トグル |
| 3 | 怒り | トグル |
| 4 | 驚き | 2秒タイマー |
| 5 | 笑顔 | トグル |
| q | 左ウィンク | トグル |
| e | 右ウィンク | トグル |

## パフォーマンス目標

| 項目 | 目標値 |
|------|--------|
| 顔追跡→パラメータ変換 | 5ms以内 |
| 物理演算（全髪パーツ） | 2ms以内 |
| PixiJS描画更新 | 16ms以内 |
| エンドツーエンドレイテンシ | 30ms以内 |
| 描画FPS | 30fps以上（60fps目標） |
| SD WebUI ベース画像生成（4枚） | 60秒以内 |
| Gemini Flash フォールバック（4枚） | 30秒以内 |
| SAM2 マスク生成（17パーツ） | 30秒以内 |
| Gemini パーツ個別生成（17パーツ・並列4） | 3-5分以内 |
