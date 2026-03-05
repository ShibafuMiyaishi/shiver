# shiver 開発規約

## パーツID一覧（18パーツ）

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
| blink_left/right | 0.0(閉)〜1.0(開) | まばたき |
| pupil_x | -1.0(左)〜1.0(右) | 瞳X |
| pupil_y | -1.0(上)〜1.0(下) | 瞳Y |
| mouth_open | 0.0〜1.0 | 口開閉 |
| brow_left/right | -1.0(下)〜1.0(上) | 眉上下 |
| head_yaw | -30〜30度 | 首振り左右 |
| head_pitch | -20〜20度 | 首振り上下 |
| head_roll | -15〜15度 | 首傾げ |
| blush_intensity | 0.0〜1.0 | 頬染め強度 |
| breath_offset | -3〜3px | 呼吸Y移動量 |
| auto_blink | 0.0〜1.0 | 自動まばたき値 |

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
- タイムアウト: 画像生成120秒、セグメンテーション60秒、その他30秒
