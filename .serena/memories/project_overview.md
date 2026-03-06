# shiver - プロジェクト概要（v3.2）

## 目的
テキストプロンプト1つでリアルタイムVTuberアバターを自動生成するシステム。
「生きてる感」（自動まばたき・呼吸・髪揺れ・瞳追跡）を重視。
正直なポジショニング: 「半自動制作ツール」（完全自動ではない）。

## 技術スタック
- Frontend: React 18 + TypeScript 5 + Vite 5 + PixiJS 7 + MediaPipe + Zustand + TailwindCSS
- Backend: FastAPI + Python 3.12 (localhost:8000)
- GPU Server: FastAPI + PyTorch CUDA + SAM2 (localhost:8001)
- 画像生成STAGE1: SD WebUI + AnythingV5/Waifu-Inpaint-XL (localhost:7860) / Gemini 2.5 Flash(フォールバック)
- 画像生成STAGE2: Gemini 2.5 Flash Image(実験) / Gemini 3 Pro Image(本番) パーツ個別生成

## v3.2 コアアーキテクチャ: 積み上げ方式
旧: 1枚絵→SAM2切り抜き（オクルージョン問題）
新: ベース画像→SAM2マスク→Geminiパーツ個別インペイント生成（隠れ部分もAI補完）

7フェーズパイプライン:
ベース画像生成 → SAM2マスク生成(Points+BBox) → パーツ個別生成(依存グラフ順)
→ 手動補正 → PixiJSリギング → リアルタイム駆動(60fps) → OBS出力

## コードベース構造
```
shiver/
├── frontend/src/          # React + PixiJS (components/, hooks/, types/, utils/)
├── backend/               # FastAPI (routers/, services/, models/)
│   └── services/          # base_image_generator.py, parts_generator.py, sam2_service.py
├── gpu-server/            # SAM2推論 (server.py, sam2_api.py)
├── docs/                  # 技術書(v3.2), アーキテクチャ, タスク管理, 規約
├── .claude/rules/         # コードスタイル, テスト, アーキテクチャ, セキュリティ
├── .claude/skills/        # phase-check, health-check
└── tmp/                   # テストコード・デバッグログ（gitignore対象）
```

## 開発フェーズ
- Phase 1 (MVP): 顔追跡+自動まばたき+手動PNGパーツ [進行中]
- Phase 2: ベース生成+SAM2マスク+パーツ個別生成+物理演算+表情
- Phase 3: リップシンク+保存+OBS安定化+Z-Index調整UI
- Phase 4: SaaS+VTube Studio互換

## 重要ドキュメント
- `docs/shiver_technical_book_v3.md` - 完全な技術仕様書v3.2（3439行・最優先参照）
- `CLAUDE.md` - Claude Code向けルール
- `docs/TASKS.md` - タスク管理
- `docs/ARCHITECTURE.md` - アーキテクチャ概要
- `docs/CONVENTIONS.md` - 規約・パラメータ値域
