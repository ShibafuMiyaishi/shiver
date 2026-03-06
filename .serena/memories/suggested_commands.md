# 開発コマンド一覧 (Windows)

## サーバー起動
```bash
# Frontend
cd frontend && npm run dev                    # http://localhost:5173

# Backend (venv有効化後)
cd backend && .venv\Scripts\activate && uvicorn main:app --reload --port 8000

# GPU Server (venv有効化後)
cd gpu-server && .venv\Scripts\activate && uvicorn server:app --reload --port 8001

# SD WebUI（--listen削除済み、--no-half-vae追加）
cd C:\dev\stable-diffusion-webui && .\webui-user.bat
```

## テスト
```bash
cd frontend && npm test
cd backend && .venv\Scripts\activate && python -m pytest
cd gpu-server && .venv\Scripts\activate && python -m pytest
```
テストコードは `tmp/` に配置する。ソースコード内にテストを書かない。

## ビルド・リント
```bash
cd frontend && npm run build
cd frontend && npm run lint
```

## Git
```bash
git add <specific-files>
git commit -m "日本語で変更内容を1文で記述"
git push origin main
```

## 環境確認
```bash
python --version          # 3.12.x
node --version            # v20+
nvidia-smi                # GPU認識
nvcc --version            # CUDA 12.1
```

## SD WebUI確認
```bash
curl http://localhost:7860/sdapi/v1/sd-models   # モデル一覧
netstat -ano | findstr :7860                     # ポート確認
```

## Windowsユーティリティ
- `ls`, `cat`, `grep` はGit Bash経由で使用可能
- PowerShell: `Get-ChildItem`, `Get-Content`, `Select-String`
- ポート確認: `netstat -ano | findstr :8001`
