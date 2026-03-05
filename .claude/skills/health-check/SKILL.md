# 環境ヘルスチェック

開発環境の状態を診断するスキル。
`/health-check` で呼び出す。

## 手順

1. 基本ツールの確認:
   ```bash
   python --version    # 3.12.x
   node --version      # v20+
   npm --version       # 10+
   git --version       # 2.4x+
   nvcc --version      # CUDA 12.1
   nvidia-smi          # GPU認識
   ```

2. Python仮想環境の確認:
   ```bash
   # Backend
   cd backend && .venv/Scripts/python -c "import fastapi; print('backend OK')"

   # GPU Server
   cd gpu-server && .venv/Scripts/python -c "import torch; print('CUDA:', torch.cuda.is_available())"
   ```

3. サーバー疎通確認（起動中の場合）:
   ```bash
   curl http://localhost:8000/health    # Backend
   curl http://localhost:8001/health    # GPU Server
   curl http://localhost:7860/docs      # SD WebUI
   curl http://localhost:5173           # Frontend
   ```

4. 環境変数の確認:
   - `backend/.env` が存在するか
   - `frontend/.env` が存在するか
   - `gpu-server/.env` が存在するか

5. 結果を一覧で報告（OK/NG）
