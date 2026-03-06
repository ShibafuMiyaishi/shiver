# shiver 開発タスク管理（v3.2）

## 現在のフェーズ: Phase 2 (コア自動化)

### Phase 1: MVP - 完了

**目標**: カメラ顔追跡 + 手動PNGパーツ + 自動まばたきが動作する

| # | タスク | 状態 |
|---|--------|------|
| 1.1 | プロジェクト初期化（frontend/backend/gpu-server ディレクトリ作成） | 完了 |
| 1.2 | Backend: FastAPI起動 + `/health` エンドポイント | 完了 |
| 1.3 | Frontend: React + Vite + TailwindCSS 初期セットアップ | 完了 |
| 1.4 | Frontend: カメラ映像取得（CameraCapture コンポーネント） | 完了 |
| 1.5 | Frontend: MediaPipe FaceLandmarker初期化 + 顔追跡 | 完了 |
| 1.6 | Frontend: faceMapper.ts（ランドマーク→パラメータ変換 + 適応閾値） | 完了 |
| 1.7 | Frontend: `public/test-parts/` に手動テストPNG配置 | 完了 |
| 1.8 | Frontend: PixiJS AvatarRenderer（パーツ読み込み + 描画） | 完了 |
| 1.9 | Frontend: まばたき・口開閉・眉上下・首振り（視差スクロール） | 完了 |
| 1.10 | Frontend: idleAnimator.ts（自動まばたき + 呼吸モーション） | 完了 |
| 1.11 | Frontend: useFaceTracking.ts メインループ統合 | 完了 |
| 1.13 | エラー表示（ErrorToast コンポーネント、日本語メッセージ） | 完了 |

---

### Phase 2: コア自動化（v3.2 積み上げ方式）

**目標**: プロンプト入力から10分以内に動くアバター完成

**事前チェック**: `curl http://localhost:8001/health`, `curl http://localhost:7860/sdapi/v1/sd-models`

| # | タスク | 状態 | 依存 |
|---|--------|------|------|
| 2.1 | GPU Server: FastAPI + SAM2モデルロード + `/health` | 完了 | Phase1完了 |
| 2.2 | GPU Server: `/segment` エンドポイント（Points+BBox対応） | 完了 | 2.1 |
| 2.3 | Backend: BaseImageGenerator（SD優先 / Gemini Flashフォールバック） | 完了 | Phase1完了 |
| 2.4 | Frontend: PromptInput コンポーネント（プロンプト入力UI） | 完了 | Phase1完了 |
| 2.5 | Frontend: 4枚生成→選択UI | 完了 | 2.3, 2.4 |
| 2.6 | Backend: SAM2マスク生成（normalized_to_pixel + compute_bbox_from_landmarks） | 完了 | 2.2 |
| 2.7 | Backend: 目3層分割マスク（瞳/白目/上まぶた） | 完了 | 2.6 |
| 2.8 | Backend: dilate_mask() マスク膨張処理 | 完了 | 2.6 |
| 2.9 | Backend: PartsGenerator（Gemini 2.5 Flash Image・依存グラフ・レート制限リトライ） | 完了 | 2.6, 2.8 |
| 2.10 | Backend: chroma_key_to_rgba()（グリーンバック透過 + rembgフォールバック） | 完了 | 2.9 |
| 2.11 | Backend: パーツ生成品質確認（キャラ一貫性・隠れ部分補完・重ね合わせ自然さ） | 未着手 | 2.10 |
| 2.12 | Frontend: 手動補正UI（PartEditor コンポーネント） | 完了 | 2.10 |
| 2.13 | Frontend: physicsEngine.ts（バネ振り子物理演算） | 完了 | Phase1完了 |
| 2.14 | Frontend: 髪パーツにSpringChain適用 | 完了 | 2.13 |
| 2.15 | Frontend: 瞳XY追跡（FaceBlendshapes連携） | 完了 | Phase1完了 |
| 2.16 | Frontend: useKeyBindings.ts（キーバインド表情） | 完了 | Phase1完了 |
| 2.17 | Frontend: ExpressionPanel コンポーネント（表情UI） | 完了 | 2.16 |

**完了条件**:
- [ ] プロンプト入力→10分以内にアバター完成（ベース60秒+SAM2 30秒+パーツ生成75秒+人間操作）
- [ ] 髪が首振りに連動して自然に揺れる
- [ ] ウィンクと照れが即時発動
- [ ] 瞳がXY方向に追従する
- [ ] 17パーツが全て生成され、重ね合わせ時に違和感がない

**Gemini 3 Proアップグレード判断チェック**:
- [ ] 17パーツが全て正常に生成される
- [ ] キャラの外見が各パーツで維持されている
- [ ] 隠れ部分補完が自然である
- [ ] 全パーツ重ね合わせ時に色ズレ・スタイル崩れがない

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
| 3.7 | PartEditorにZ-Index手動調整UI（サンドイッチ構造対応） | 未着手 |

---

### Phase 4: ビジネス化（オプション）

| # | タスク | 状態 |
|---|--------|------|
| 4.1 | SaaS化（クラウドデプロイ） | 未着手 |
| 4.2 | VTube Studio互換フォーマットエクスポート | 未着手 |
| 4.3 | 複数キャラ管理・切り替え | 未着手 |
| 4.4 | Gemini SynthID利用規約確認 | 未着手 |
