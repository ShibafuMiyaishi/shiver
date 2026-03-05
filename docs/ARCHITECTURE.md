# shiver システムアーキテクチャ

## 全体パイプライン

```
[Phase 1: 生成]
  プロンプト → ImageGenerator → SD(優先) / Gemini(フォールバック) → 4枚生成 → ユーザー選択

[Phase 2: 分割]
  選択画像 → MediaPipe Face Mesh(正規化座標) → normalized_to_pixel()変換
  → SAM2自動セグメンテーション(GPU Server) → 18パーツPNG(背景透過)

[Phase 3: リギング]
  各パーツ → PixiJS Sprite配置(zIndex/parallax/anchor設定)
  → hair_*パーツにSpringChain物理演算アタッチ

[Phase 4: リアルタイム駆動]
  requestAnimationFrame(~60fps):
    A. MediaPipe顔追跡 → faceMapper → 適応閾値で個人差吸収
    B. idleAnimator(常時) → 自動まばたき(3-5秒周期) + 呼吸(4秒サインカーブ)
    C. physicsEngine(常時) → 髪揺れ(バネ振り子, head_yaw/pitch入力)
    D. キーバインド表情(割り込み) → パラメータオーバーライド
    E. pixiRenderer → finalParams + 物理演算結果で描画更新

[Phase 5: 出力]
  ブラウザプレビュー(backgroundAlpha:0) → OBSブラウザソース → Virtual Camera → 配信
```

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
+----------+---------------------+--------------------+
           |                     |
+----------v----------+ +-------v---------------------+
| SD WebUI            | | GPU Server (localhost:8001)  |
| (localhost:7860)    | | SAM2 + PyTorch CUDA         |
| 画像生成API         | | パーツセグメンテーション     |
+---------------------+ +-----------------------------+
```

## パーツ構成（18パーツ）

### 顔パーツ
- `face` - 顔全体
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

## 「生きてる感」の実現方法

| 要素 | 実装 | 常時実行 |
|------|------|---------|
| 自動まばたき | 3-5秒ランダム周期、0.15秒で開閉 | Yes |
| 呼吸 | 4秒周期サインカーブ、Y軸+-3px | Yes |
| 髪揺れ | バネ振り子物理演算、head_yaw/pitch入力 | Yes |
| 瞳追跡 | FaceBlendshapes eyeLookIn/Out/Up/Down | 顔検出時 |
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
| SD画像生成（4枚） | 60秒以内 |
| SAM2セグメンテーション（全パーツ） | 30秒以内 |
