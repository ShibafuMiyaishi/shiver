# shiver 開発タスク管理

## 現在のフェーズ: Phase 1 (MVP)

### Phase 1: MVP

**目標**: カメラ顔追跡 + 手動PNGパーツ + 自動まばたきが動作する

**事前チェック**: `python --version` (3.12), `node --version` (v20+), `nvidia-smi`

| # | タスク | 状態 | 依存 |
|---|--------|------|------|
| 1.1 | プロジェクト初期化（frontend/backend/gpu-server ディレクトリ作成） | 未着手 | - |
| 1.2 | Backend: FastAPI起動 + `/health` エンドポイント | 未着手 | 1.1 |
| 1.3 | Frontend: React + Vite + TailwindCSS 初期セットアップ | 未着手 | 1.1 |
| 1.4 | Frontend: カメラ映像取得（CameraCapture コンポーネント） | 未着手 | 1.3 |
| 1.5 | Frontend: MediaPipe FaceLandmarker初期化 + 顔追跡 | 未着手 | 1.4 |
| 1.6 | Frontend: faceMapper.ts（ランドマーク→パラメータ変換 + 適応閾値） | 未着手 | 1.5 |
| 1.7 | Frontend: `public/test-parts/` に手動テストPNG配置 | 未着手 | 1.3 |
| 1.8 | Frontend: PixiJS AvatarRenderer（パーツ読み込み + 描画） | 未着手 | 1.7 |
| 1.9 | Frontend: まばたき・口開閉・眉上下・首振り（視差スクロール） | 未着手 | 1.6, 1.8 |
| 1.10 | Frontend: idleAnimator.ts（自動まばたき + 呼吸モーション） | 未着手 | 1.8 |
| 1.11 | Frontend: useFaceTracking.ts メインループ統合 | 未着手 | 1.9, 1.10 |
| 1.12 | Backend <-> Frontend WebSocket接続（顔パラメータストリーム） | 未着手 | 1.2, 1.11 |
| 1.13 | エラー表示（ErrorToast コンポーネント、日本語メッセージ） | 未着手 | 1.3 |

**完了条件**:
- [ ] カメラに向かって目を閉じるとアバターも閉じる
- [ ] PCから離れても自動でまばたきし続ける
- [ ] 呼吸モーションで体が微妙に上下する

---

### Phase 2: コア自動化

**目標**: プロンプト入力から3分以内に動くアバター完成

**事前チェック**: `curl http://localhost:8001/health`, `curl http://localhost:7860/docs`

| # | タスク | 状態 | 依存 |
|---|--------|------|------|
| 2.1 | GPU Server: FastAPI + SAM2モデルロード + `/health` | 未着手 | Phase1完了 |
| 2.2 | GPU Server: `/segment` エンドポイント（SAM2推論） | 未着手 | 2.1 |
| 2.3 | Backend: ImageGenerator（SD API呼び出し） | 未着手 | Phase1完了 |
| 2.4 | Backend: Geminiフォールバック実装 | 未着手 | 2.3 |
| 2.5 | Frontend: PromptInput コンポーネント（プロンプト入力UI） | 未着手 | Phase1完了 |
| 2.6 | Frontend: 4枚生成→選択UI | 未着手 | 2.3, 2.5 |
| 2.7 | Backend: SAM2自動パーツ分割（normalized_to_pixel必須） | 未着手 | 2.2 |
| 2.8 | Backend: 目3層分割（瞳/白目/上まぶた） | 未着手 | 2.7 |
| 2.9 | Frontend: 手動補正UI（PartEditor コンポーネント） | 未着手 | 2.7 |
| 2.10 | Frontend: physicsEngine.ts（バネ振り子物理演算） | 未着手 | Phase1完了 |
| 2.11 | Frontend: 髪パーツにSpringChain適用 | 未着手 | 2.10 |
| 2.12 | Frontend: 瞳XY追跡（FaceBlendshapes連携） | 未着手 | Phase1完了 |
| 2.13 | Frontend: useKeyBindings.ts（キーバインド表情） | 未着手 | Phase1完了 |
| 2.14 | Frontend: ExpressionPanel コンポーネント（表情UI） | 未着手 | 2.13 |

**完了条件**:
- [ ] プロンプト入力→3分以内にアバター完成
- [ ] 髪が首振りに連動して自然に揺れる
- [ ] ウィンクと照れが即時発動
- [ ] 瞳がXY方向に追従する

---

### Phase 3: フル自動化

| # | タスク | 状態 |
|---|--------|------|
| 3.1 | アンカーポイント・parallax・物理演算の完全自動推定 | 未着手 |
| 3.2 | 口形状差分（あいうえおリップシンク） | 未着手 |
| 3.3 | プロジェクト保存・読み込み（JSON形式） | 未着手 |
| 3.4 | OBS Virtual Camera安定化 | 未着手 |
| 3.5 | 30fps安定動作チューニング | 未着手 |
| 3.6 | キーバインドカスタマイズUI | 未着手 |

---

### Phase 4: ビジネス化（オプション）

| # | タスク | 状態 |
|---|--------|------|
| 4.1 | SaaS化（クラウドデプロイ） | 未着手 |
| 4.2 | VTube Studio互換フォーマットエクスポート | 未着手 |
| 4.3 | 複数キャラ管理・切り替え | 未着手 |
| 4.4 | Gemini SynthID利用規約確認 | 未着手 |
