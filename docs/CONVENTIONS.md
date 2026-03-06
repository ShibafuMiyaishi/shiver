# shiver 開発規約（v3.2）

## パーツID一覧（17パーツ）

全てのパーツIDは以下のいずれかであること。新規追加・変更禁止。

```typescript
type AvatarPartId =
  | "hair_back" | "face" | "nose"
  | "left_white" | "right_white"
  | "left_pupil" | "right_pupil"
  | "left_upper_lid" | "right_upper_lid"
  | "left_brow" | "right_brow"
  | "mouth"
  | "blush_left" | "blush_right"
  | "hair_front" | "hair_side_left" | "hair_side_right";
```

## 感情タイプ

```typescript
type EmotionType = "neutral" | "happy" | "blush" | "sad" | "angry" | "surprised";
```

## パラメータ値域

| パラメータ | 範囲 | 説明 |
|-----------|------|------|
| blink_left/right | 0.0(閉)~1.0(開) | まばたき |
| pupil_x | -1.0(左)~1.0(右) | 瞳X |
| pupil_y | -1.0(上)~1.0(下) | 瞳Y |
| mouth_open | 0.0~1.0 | 口開閉 |
| brow_left/right | -1.0(下)~1.0(上) | 眉上下 |
| head_yaw | -30~30度 | 首振り左右 |
| head_pitch | -20~20度 | 首振り上下 |
| head_roll | -15~15度 | 首傾げ |
| blush_intensity | 0.0~1.0 | 頬染め強度 |
| breath_offset | -3~3px | 呼吸Y移動量 |
| auto_blink | 0.0~1.0 | 自動まばたき値 |

## MediaPipe ランドマーク

- 総数: **478**（iris landmark 468-477 を含む）
- FaceLandmarker設定: `outputFaceBlendshapes: true` 必須

## FaceBlendshape名（v3.2修正）

MediaPipe FaceBlendshapesのカテゴリ名は以下の形式。`eyeLookOut_L` ではない。

| 正しい名前 | 誤った名前（使用禁止） |
|-----------|---------------------|
| `eyeLookOutLeft` | `eyeLookOut_L` |
| `eyeLookInLeft` | `eyeLookIn_L` |
| `eyeLookUpLeft` | `eyeLookUp_L` |
| `eyeLookDownLeft` | `eyeLookDown_L` |

## Backend サービスファイル名

| ファイル | 責務 |
|---------|------|
| `services/base_image_generator.py` | STAGE 1: ベース画像生成（SD/Geminiフォールバック） |
| `services/parts_generator.py` | STAGE 2: パーツ個別生成（Geminiインペイント） |
| `services/sam2_service.py` | SAM2マスク生成 + normalized_to_pixel + compute_bbox |

## 画像生成モデル

| 用途 | モデル | 備考 |
|------|-------|------|
| STAGE 1 ベース | SD WebUI + AnythingV5 | ローカル・無料 |
| STAGE 1 フォールバック | gemini-2.5-flash-image | Cloud API |
| STAGE 2 実験 | gemini-2.5-flash-image | $0.66/キャラ |
| STAGE 2 本番 | gemini-3-pro-image-preview | $2.28/キャラ |

## エラーメッセージ規約

- 全てのエラーメッセージは日本語で表示する
- ユーザー向けメッセージは具体的な対処法を含める
- 例: "カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。"

## Git規約

- ブランチ名: `feature/機能名` or `fix/修正内容`
- コミットメッセージ: 日本語OK、変更内容を簡潔に
- `.env` ファイルは絶対にコミットしない
- `node_modules/`, `.venv/`, `__pycache__/` はコミットしない

## API設計規約

- エンドポイントは RESTful（`/api/v1/generate`, `/api/v1/segment`）
- リクエスト/レスポンスは Pydantic モデルで定義
- エラーレスポンスは `{"detail": "日本語エラーメッセージ"}` 形式
- タイムアウト: 画像生成120秒、セグメンテーション60秒、パーツ生成300秒、その他30秒

## 透過処理規約

- パーツ生成時のプロンプトは必ずグリーンバック(`#00FF00`)を指定する
- 白背景は使用禁止（白目・白髪が消えるため）
- 透過処理の優先順: RGBA直接 → HSVクロマキー → rembg → 手動補正
