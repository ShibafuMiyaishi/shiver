# shiver - AI自動生成VTuberアバターシステム

テキストプロンプト1つでリアルタイムVTuberアバターを自動生成するシステム。
詳細仕様: @docs/shiver_technical_book_v3.md

## 絶対ルール

- フェーズを順番に進める。完了条件を満たしてから次へ
- 全ての非同期処理にtry-catchを書く。エラーは日本語で表示
- 設計を独断で変更しない。技術書の定義を最優先とする
- 環境変数は必ず `.env` から読む。ハードコード禁止
- 物理演算・呼吸・自動まばたきは毎フレーム実行（顔検出の有無に関わらず）

## 開発環境

- OS: Windows 11 / 1台完結（開発+GPU推論）
- Python: 3.12 (pyenv-win + venv)
- Node.js: v20+ LTS
- GPU: NVIDIA RTX + CUDA 12.1
- エディタ: VS Code

## ビルド・実行コマンド

```bash
# フロントエンド
cd frontend && npm run dev          # http://localhost:5173

# バックエンド（venv有効化後）
cd backend && uvicorn main:app --reload --port 8000

# GPUサーバー（venv有効化後）
cd gpu-server && uvicorn server:app --reload --port 8001

# SD WebUI（別ターミナル）
cd C:\dev\stable-diffusion-webui && .\webui-user.bat
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 + PixiJS 7 + MediaPipe + Zustand + TailwindCSS |
| Backend | FastAPI + Python 3.12 (localhost:8000) |
| GPU Server | FastAPI + PyTorch CUDA + SAM2 (localhost:8001) |
| 画像生成(STAGE1) | Gemini 2.5 Flash Image(優先) / SD WebUI + Illustrious XL v2.0(フォールバック) |
| 画像生成(STAGE2) | Gemini 2.5 Flash Image(実験) / Gemini 3 Pro Image(本番) |

## v3.2 コアアーキテクチャ: 積み上げ方式

旧方式（1枚絵をSAM2で切り抜き）ではオクルージョン問題が発生。
v3.2では「ベース画像 → SAM2マスク → Geminiパーツ個別インペイント生成」に変更。

```
STAGE 1: ベース画像生成 → Gemini Flash Image(優先) / SD WebUI(フォールバック)
STAGE 2: パーツ個別生成 → SAM2マスク + Geminiインペイント(依存グラフ順)
```

## ディレクトリ構成

```
shiver/
├── frontend/        # React + Vite + PixiJS
│   └── src/
│       ├── components/   # UI部品
│       ├── hooks/        # React hooks (顔追跡, WS, 状態管理)
│       ├── types/        # TypeScript型定義
│       └── utils/        # レンダラー, 物理演算, アイドルアニメ, faceMapper
├── backend/         # FastAPI (画像生成, セグメンテーション, アバター管理)
│   ├── routers/
│   ├── services/    # base_image_generator.py, parts_generator.py, sam2_service.py
│   └── models/
└── gpu-server/      # SAM2推論サーバー
```

## コードスタイル

- Frontend: ESModules, 2スペースインデント, Prettier自動整形
- Backend: Python PEP8, 4スペースインデント
- 型定義は `frontend/src/types/` に集約
- コンポーネントは1ファイル1コンポーネント

## 開発フェーズ（現在: Phase 1）

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 MVP | 顔追跡+自動まばたき+手動PNGパーツ | 進行中 |
| 2 コア自動化 | ベース生成+SAM2マスク+パーツ個別生成+物理演算+表情 | - |
| 3 フル自動化 | リップシンク+保存+OBS安定化+Z-Index調整UI | - |
| 4 ビジネス化 | SaaS+VTube Studio互換 | - |

詳細タスク: @docs/TASKS.md

## 通信設計

全てlocalhost通信（ファイアウォール設定不要）
- Frontend → Backend: REST API + WebSocket
- Backend → SD WebUI: REST (localhost:7860)
- Backend → GPU Server: REST (localhost:8001)

## 重要な注意事項

- SAM2へのランドマーク座標は必ず `normalized_to_pixel()` を通す
- SAM2にはPoints + BBox両方を渡す（アニメドメインギャップ対策）
- パーツ生成は白背景禁止。グリーンバック(#00FF00)必須 → `chroma_key_to_rgba()`で透過
- SAM2マスクは `dilate_mask(dilation_px=3)` で膨張してからインペイントに渡す
- PixiJS視差は skew 禁止。各スプライトのX/Yをparallax係数で個別移動
- deltaTimeは `Math.min(deltaTime, 0.05)` で必ずクランプ
- 目の描画順: white(500) → pupil(600) → upper_lid(700)
- まばたき合成: `blink_face * auto_blink` の積
- FaceBlendshape名: `eyeLookOutLeft`（`eyeLookOut_L`ではない）
- ランドマーク数: 478（iris含む。468ではない）
- CORS: localhost:5173 のみ許可（`*` は開発時のみ）
- `.env` ファイルは絶対にGitコミットしない
- Gemini APIは `.aio`（async client）を使う。同期版はイベントループをブロックする
- Gemini 429エラーは `call_with_retry()` でExponential Backoff

## ワークフロールール

- 思考は英語で行う。ユーザーへの報告・質問・会話は日本語で行う
- GitHubに接続し、コミット時は変更内容がわかる1文の日本語メッセージを書く
- コミット後はプッシュまで行う
- テストコードはソースコード内に書かない。`tmp/` ディレクトリに専用ファイルとして作成する
- デバッグ用ログ出力も `tmp/` に格納する
- タスク管理を行い、進捗に応じて `docs/TASKS.md` を更新する
- ドキュメント・メモリは常に最新状態を維持する。古い記述は削除してよい
- コンテキストが長くなったら `/compact` を実行する
- APIを実装する際には、モデル名や使用方法などを公式ドキュメントを調べて確実に確認する
- わからなくなったり、エラーの処理がうまくいかなくなった場合は、似たような事例がないかなどを公式ドキュメントや技術ブログを調べ、解決方法を探る

## 追加ルール

@.claude/rules/code-style.md
@.claude/rules/testing.md
@.claude/rules/architecture.md
@.claude/rules/security.md
