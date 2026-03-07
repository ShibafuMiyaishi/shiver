---
paths:
  - "frontend/src/**/*.ts"
  - "frontend/src/**/*.tsx"
  - "backend/**/*.py"
  - "gpu-server/**/*.py"
---

# アーキテクチャルール（v3.2）

## パイプライン（変更禁止）

```
プロンプト → SD/Geminiベース画像生成(STAGE1) → SAM2マスク生成(Points+BBox)
→ Geminiパーツ個別インペイント生成(STAGE2・依存グラフ順) → chroma_key_to_rgba透過
→ PixiJSリギング → リアルタイム駆動 → OBS出力
```

## 画像生成2段階構成（v3.2）

- STAGE 1 (BaseImageGenerator): Gemini 2.5 Flash Image(優先) / SD WebUI+Illustrious XL v2.0(フォールバック)
- STAGE 2 (PartsGenerator): Geminiマスクインペイントでパーツ個別生成
  - 依存グラフ(GENERATION_LAYERS)に基づきレイヤー順次・レイヤー内並列
  - グリーンバック(#00FF00)指定必須。白背景禁止
  - chroma_key_to_rgba()で透過処理
  - call_with_retry()で429エラーに対応

## Frontend アーキテクチャ

### メインループ（60fps requestAnimationFrame）

毎フレーム以下を順番に実行:
1. MediaPipe顔追跡 → faceMapper.tsでパラメータ変換
2. idleAnimator.ts（常時）→ 呼吸(全体ボビング) + 自動まばたき
3. physicsEngine.ts（常時）→ 髪揺れ物理演算
4. キーバインド表情（割り込み）→ パラメータオーバーライド
5. pixiRenderer.ts → 最終描画

### ファイル責務（変更・分割・統合禁止）

| ファイル | 責務 |
|---------|------|
| `pixiRenderer.ts` | 全PixiJS描画。AvatarRendererクラス |
| `physicsEngine.ts` | バネ振り子物理演算のみ |
| `idleAnimator.ts` | 呼吸 + 自動まばたきのみ |
| `faceMapper.ts` | ランドマーク→パラメータ変換 + 適応閾値 |
| `useFaceTracking.ts` | メインループ統合。上記4つを呼ぶ |
| `useKeyBindings.ts` | キーバインド表情管理 |

### パーツ描画順（zIndex）

```
hair_back(100) → face(300) → brow(400) → white(500) → pupil(600)
→ upper_lid(700) → nose(800) → mouth(900) → blush(1000)
→ hair_side(1050) → hair_front(1100)
```

## Backend アーキテクチャ

- `main.py`: FastAPIアプリ初期化 + CORS + ルーターマウント
- `routers/`: エンドポイント定義のみ。ビジネスロジックは `services/` に書く
- `services/base_image_generator.py`: STAGE 1 ベース画像生成（SD/Geminiフォールバック）
- `services/parts_generator.py`: STAGE 2 パーツ個別生成（Geminiインペイント・依存グラフ）
- `services/sam2_service.py`: SAM2マスク生成 + `normalized_to_pixel()` + `compute_bbox_from_landmarks()` + `dilate_mask()`

## GPU Server アーキテクチャ

- `server.py`: FastAPIアプリ + `/health`, `/segment` エンドポイント
- `sam2_api.py`: SAM2モデルロード + 推論ロジック（Points+BBox対応）
- PyTorchは `device = "cuda" if torch.cuda.is_available() else "cpu"` で自動選択

## 通信プロトコル

- Frontend <-> Backend: REST (画像生成/セグメント) + WebSocket (顔パラメータ)
- Backend <-> GPU Server: REST (localhost:8001)
- Backend <-> SD WebUI: REST (localhost:7860)
- Backend <-> Gemini API: HTTPS (google-genai SDK, .aio async client)
- 全てlocalhost（Gemini APIを除く）。外部通信なし
