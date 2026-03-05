# コードスタイルルール

## TypeScript (Frontend)

- ESModules (`import/export`) を使用。CommonJS禁止
- 2スペースインデント
- `const` をデフォルト使用。`let` は再代入が必要な場合のみ
- 型定義は `frontend/src/types/` に集約し、コンポーネントファイル内に書かない
- React コンポーネントは関数コンポーネント + hooks のみ。クラスコンポーネント禁止
- Zustand ストアは `frontend/src/hooks/useAvatarState.ts` に集約
- PixiJS のスプライト操作は `utils/pixiRenderer.ts` の `AvatarRenderer` クラスに閉じる
- Tailwind CSS でスタイリング。インラインCSS・CSS Modules禁止

## Python (Backend / GPU Server)

- PEP8 準拠、4スペースインデント
- 型ヒントを必ず書く (`def func(x: int) -> str:`)
- async関数は全て `async def` で定義
- FastAPIのルーターは `routers/` に分離。`main.py` にロジックを書かない
- Pydanticモデルは `models/schemas.py` に集約
- backend と gpu-server は別々のvenv。依存関係を混ぜない

## 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| TS変数・関数 | camelCase | `avatarRenderer`, `updatePhysics` |
| TSコンポーネント | PascalCase | `AvatarCanvas`, `PromptInput` |
| TS型・interface | PascalCase | `AvatarPart`, `PhysicsConfig` |
| Python変数・関数 | snake_case | `image_generator`, `auto_segment` |
| Pythonクラス | PascalCase | `ImageGenerator` |
| 環境変数 | SCREAMING_SNAKE | `GPU_SERVER_HOST` |
| パーツID | snake_case | `hair_front`, `left_pupil` |

## ファイル命名

- TSコンポーネント: PascalCase (`AvatarCanvas.tsx`)
- TSユーティリティ: camelCase (`physicsEngine.ts`)
- Python: snake_case (`image_generator.py`)
- 設定ファイル: kebab-case (`vite.config.ts` 等のツール規約に従う)
