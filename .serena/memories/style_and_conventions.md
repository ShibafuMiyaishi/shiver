# コードスタイル・規約（v3.2）

## TypeScript (Frontend)
- ESModules, 2スペースインデント, Prettier自動整形
- const優先、関数コンポーネント+hooks、クラスコンポーネント禁止
- 型定義は `frontend/src/types/` に集約
- PixiJS操作は `utils/pixiRenderer.ts` の AvatarRenderer クラスに閉じる
- Tailwind CSSでスタイリング

## Python (Backend / GPU Server)
- PEP8, 4スペースインデント, 型ヒント必須
- FastAPIルーターは `routers/` に分離、ロジックは `services/`
- Pydanticモデルは `models/schemas.py` に集約
- backend と gpu-server は別々のvenv
- Backend追加依存: opencv-python(必須), rembg(オプション)

## 命名規則
- TS変数・関数: camelCase / コンポーネント: PascalCase / 型: PascalCase
- Python変数・関数: snake_case / クラス: PascalCase
- 環境変数: SCREAMING_SNAKE / パーツID: snake_case

## v3.2 重要な修正点
- FaceBlendshape名: `eyeLookOutLeft`（`eyeLookOut_L`ではない）
- ランドマーク数: 478（iris 468-477含む。468ではない）
- パーツ生成はグリーンバック(#00FF00)指定必須。白背景禁止
- Gemini APIは `.aio`(async client)を使う。同期版はブロックする

## エラーメッセージ
- 全て日本語。具体的な対処法を含める。
- 全async処理にtry-catch必須。

## Git規約
- コミットメッセージ: 日本語1文で変更内容を記述
- コミット後は必ずプッシュ
- `.env` は絶対にコミットしない
