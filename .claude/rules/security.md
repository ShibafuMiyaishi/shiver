# セキュリティルール

## 環境変数

- APIキー・シークレットは全て `.env` ファイルに格納
- `.env` は `.gitignore` に含める。絶対にコミットしない
- コード内にAPIキーをハードコードしない
- `python-dotenv` (Backend) / `import.meta.env` (Frontend) で読み込む

## CORS

- 開発時: `http://localhost:5173` のみ許可
- `allow_origins=["*"]` は開発時の一時的な使用のみ。本番前に必ず制限
- SaaS化時にはオリジン制限を厳格化すること

## 入力バリデーション

- ユーザー入力（プロンプト等）は Backend で Pydantic モデルで検証
- Base64画像データのサイズ上限を設定（DoS防止）
- ファイルアップロードは `python-multipart` でMIMEタイプ検証

## 依存関係

- `pip install` / `npm install` は既知のパッケージのみ
- GPU ServerのSAM2は公式GitHubリポジトリからのみインストール
- PyTorchは `--index-url https://download.pytorch.org/whl/cu121` 指定必須

## Gemini API

- SynthID電子透かしが自動埋め込まれる
- 商用利用前にGoogle利用規約を確認すること
- APIキーはGoogle AI Studioで発行したものを使用
