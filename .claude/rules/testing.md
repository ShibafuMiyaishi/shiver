# テストルール

## フェーズ開始前のヘルスチェック

各フェーズ開始前に以下を確認すること（技術書 Section 18 参照）:

```bash
# Phase 1 事前チェック
python --version                    # 3.12.x
node --version                      # v20+
nvidia-smi                          # GPU認識確認

# Phase 2 事前チェック
curl http://localhost:8001/health   # GPU Server疎通
curl http://localhost:7860/sdapi/v1/sd-models  # SD WebUI API確認
```

ブラウザコンソールから `runHealthCheck()` を実行して全チェック通過を確認する。
SD WebUIはPhase 1では任意（失敗しても続行可）。

## Frontend テスト方針

- ユニットテスト: 物理演算 (`physicsEngine.ts`), アイドルアニメ (`idleAnimator.ts`), faceMapper (`faceMapper.ts`)
- 視覚テスト: PixiJS レンダリングは手動確認（ブラウザで目視）
- WebSocket接続: 手動テスト（バックエンド起動状態で確認）

## Backend テスト方針

- APIエンドポイント: FastAPI TestClient で `/health`, `/generate`, `/segment` を検証
- ベース画像生成: Gemini優先→SDフォールバックの両経路をテスト
- パーツ生成: PartsGeneratorの依存グラフ順実行・chroma_key_to_rgba透過処理をテスト
- SAM2連携: ピクセル座標変換 (`normalized_to_pixel`) + BBox計算 (`compute_bbox_from_landmarks`) の入出力テスト
- マスク膨張: `dilate_mask()` の入出力テスト

## テスト実行コマンド

```bash
# Frontend
cd frontend && npm test

# Backend
cd backend && .venv/Scripts/activate && python -m pytest

# GPU Server
cd gpu-server && .venv/Scripts/activate && python -m pytest
```

## 完了条件チェック

各Phaseの完了条件は技術書 Section 18 に定義。
条件を全て満たしたことを確認してからPhase番号を進める。

Phase 2追加: パーツ生成品質チェック（17パーツ生成・キャラ一貫性・隠れ部分補完・重ね合わせ自然さ）。
