# shiver 開発タスク管理（v3.2）

## 現在のフェーズ: Phase 3 完了 / Phase 4 未着手

### Phase 1: MVP - 完了

### Phase 2: コア自動化 - 完了

タスク2.1〜2.17 全完了。品質確認(2.11)はAPI実動作テスト時に実施。

---

### Phase 3: フル自動化 - 完了

**目標**: 非エンジニアでも使える完成度。30fps安定。

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 3.1 | パーツ位置自動推定（ランドマークからbaseX/Y/Width/Height計算） | 完了 | partPositioner.ts |
| 3.2 | 口形状差分（あいうえおリップシンク） | 完了 | mouth_form パラメータ追加 |
| 3.3 | プロジェクト保存・読み込み（JSON形式） | 完了 | projectManager.ts |
| 3.4 | OBS Virtual Camera安定化（/avatar専用ルート） | 完了 | AvatarOnly.tsx + main.tsx |
| 3.5 | 30fps安定動作チューニング | 完了 | 顔検出2フレームに1回 + PixiJS最適化 |
| 3.6 | キーバインドカスタマイズUI | 完了 | KeyBindingEditor.tsx |
| 3.7 | PartEditorにZ-Index手動調整UI（サンドイッチ構造対応） | 完了 | ドラッグ&ドロップ並替 |

**追加タスク（Phase 3完了後）**:

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 3.8 | Gemini API呼び出し最適化 | 完了 | retryDelay解析・リトライ削減・順次生成・semaphore=2 |
| 3.9 | ログUTF-8化（Windows文字化け対策） | 完了 | logging.Logger + UTF-8 StreamHandler |
| 3.10 | ErrorToast視認性改善 | 完了 | 自動消去5秒→15秒 |
| 3.11 | App.tsx画像サイズ動的取得 | 完了 | SAM2送信前にImage()で実寸取得 |
| 3.12 | 実API接続テスト（ベース画像生成〜パーツ生成フルフロー） | 未実施 | Geminiクォータリセット後に実施 |

---

### Phase 4: ビジネス化（オプション）

| # | タスク | 状態 |
|---|--------|------|
| 4.1 | SaaS化（クラウドデプロイ） | 未着手 |
| 4.2 | VTube Studio互換フォーマットエクスポート | 未着手 |
| 4.3 | 複数キャラ管理・切り替え | 未着手 |
| 4.4 | Gemini SynthID利用規約確認 | 未着手 |
