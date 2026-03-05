# shiver 技術書 v3.0（最終版）
## AI自動生成VTuberアバターシステム

**バージョン**: 3.1.0  
**最終更新**: 2026-03-05  
**対象読者**: Claude Code (AIコーディングエージェント)

### 変更履歴
| バージョン | 主な変更 |
|-----------|---------|
| v1.0 | 初版 |
| v2.0 | 首振り修正・座標変換追加・適応閾値・エラーハンドリング・Geminiフォールバック |
| v3.0 | 物理演算（髪揺れ）・呼吸モーション・自動まばたき・瞳XY追跡・キーバインド表情・目3層分割を追加 |
| v3.1 | **開発環境をWindows + VS Codeに変更。開発・GPU推論をWindows 1台に統合** |

---

## ⚠️ Claude Codeへの絶対的な指示

1. **フェーズを順番に進めること**。完了条件を満たしてから次へ進む
2. **全ての非同期処理にtry-catchを必ず書くこと**。エラーは日本語でユーザーに表示する
3. **フェーズ開始前にヘルスチェックスクリプトを必ず実行すること**
4. **設計を独断で変更しないこと**。この技術書の定義を最優先とする
5. **環境変数は必ず `.env` ファイルから読み込むこと**。ハードコードは禁止
6. **物理演算・呼吸・自動まばたきは毎フレーム必ず実行すること**。顔検出の有無に関わらず動き続ける

---

## 1. プロジェクト概要

### 1.1 システム名
**shiver**

### 1.2 ビジョン
> テキストプロンプト1つ入力するだけで、リアルタイムで「生きているように見える」オリジナルVTuberアバターが自動生成されるシステム

### 1.3 「生きてる感」の定義
shiverが目指すアバターは単に「顔追跡で動く」だけでなく、以下すべてを満たすこと。

| 要素 | 説明 | 実装 |
|------|------|------|
| 自動まばたき | 顔未検出時も3〜5秒に1回まばたきする | Phase 1 |
| 呼吸モーション | 静止中も体が微妙に上下する | Phase 2 |
| 物理演算（髪揺れ） | 首振りに連動して髪がリアルに揺れる | Phase 2 |
| 瞳XY追跡 | 目線が動く。死んだ目にならない | Phase 2 |
| キーバインド表情 | 照れ・泣き・怒り・驚き・笑顔・ウィンクを即時発動 | Phase 2 |

---

## 2. 開発環境

### 2.1 マシン構成

本プロジェクトは **Windows 1台で開発・GPU推論を兼任** する構成。  
エディタは **VS Code** を使用。

#### 開発機 兼 GPU推論機（Windows）
| 項目 | 値 |
|------|-----|
| OS | Windows 10/11 |
| GPU | NVIDIA RTX系 |
| Python | 3.12 |
| Python環境管理 | pyenv-win + venv |
| Node.js | v20以上（LTS推奨） |
| エディタ | **VS Code** |
| CUDA | CUDA Toolkit 12.1以上 |
| 用途 | フロントエンド・バックエンド開発 + SD画像生成 + SAM2推論 **すべて同一マシン** |

> **補足:** v3.0まではMac（開発）+ Windows（GPU）の2台構成だったが、v3.1からWindows 1台に統合。  
> バックエンドとGPUサーバーはlocalhost通信になるため、LAN設定・ファイアウォール開放は不要になった。

---

## 2.2 ゼロからの開発環境構築手順

> ⚠️ **この節はインストール済みのツールが何もない前提で書かれている。**  
> 各ステップで「確認コマンド」を実行し、期待通りの出力が出てから次へ進むこと。  
> エラーが出たら次に進まず、その場で解消する。

---

### STEP 0: PowerShell の実行ポリシー変更（最初に1回だけ）

WindowsはデフォルトでPowerShellスクリプトの実行を禁止している。  
まず管理者権限でこれを緩和する。

```powershell
# 「Windows PowerShell」を右クリック →「管理者として実行」で開く
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 確認
Get-ExecutionPolicy -Scope CurrentUser
# → RemoteSigned と表示されればOK
```

---

### STEP 1: Git インストール

Git がなければソースコードの取得や pyenv-win のインストールができない。

1. https://git-scm.com/download/win にアクセス
2. 「64-bit Git for Windows Setup」をダウンロード・実行
3. インストール中の設定は基本デフォルトでOK。ただし以下だけ変更:
   - 「Adjusting your PATH environment」→ **「Git from the command line and also from 3rd-party software」** を選択
4. インストール完了後、PowerShellを**新しく開き直して**確認:

```powershell
git --version
# → git version 2.4x.x であることを確認
```

---

### STEP 2: VS Code インストール

1. https://code.visualstudio.com/ にアクセス
2. 「Download for Windows」をクリック → インストーラーを実行
3. インストール中に以下を **必ずチェック**:
   - ✅「PATHへの追加（再起動後に使用可能）」
   - ✅「Codeで開く（エクスプローラーのコンテキストメニュー）」
4. インストール完了後、PowerShellを**新しく開き直して**確認:

```powershell
code --version
# → 1.9x.x のようなバージョンが表示されればOK
```

#### VS Code 推奨拡張機能のインストール

VS Codeを開き、以下のコマンドをPowerShellで実行する（VS Codeが起動した状態で実行すること）。

```powershell
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss
```

| 拡張機能ID | 用途 |
|-----------|------|
| `ms-python.python` | Python言語サポート・仮想環境の自動検出 |
| `ms-python.vscode-pylance` | Python型チェック・高速補完 |
| `dbaeumer.vscode-eslint` | TypeScript/JS Lint |
| `esbenp.prettier-vscode` | コードフォーマッタ（保存時に自動整形） |
| `bradlc.vscode-tailwindcss` | Tailwind CSSクラス補完 |

---

### STEP 3: pyenv-win インストール（Python バージョン管理）

`pyenv-win` を使うことで複数のPythonバージョンを切り替えられる。  
**管理者権限のPowerShell** で実行する。

```powershell
# pyenv-winインストールスクリプトをダウンロードして実行
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://raw.githubusercontent.com/pyenv-win/pyenv-win/master/pyenv-win/install-pyenv-win.ps1" `
  -OutFile "$HOME\install-pyenv-win.ps1"
& "$HOME\install-pyenv-win.ps1"
```

インストール後、**PowerShellを完全に閉じて新しく開き直す**（PATH反映のため必須）。

```powershell
# 確認（新しいPowerShellで）
pyenv --version
# → pyenv 3.x.x であることを確認

# インストールできるPythonの一覧を更新
pyenv update
```

> ⚠️ `pyenv` が見つからないエラーが出る場合:  
> 「Windowsの設定」→「環境変数」→ユーザー環境変数の `Path` に  
> `%USERPROFILE%\.pyenv\pyenv-win\bin` と `%USERPROFILE%\.pyenv\pyenv-win\shims` が追加されているか確認する。

---

### STEP 4: Python 3.12 インストール

```powershell
# Python 3.12.0 をインストール
pyenv install 3.12.0

# インストール確認
pyenv versions
# → 3.12.0 が一覧に出ればOK

# システム全体のデフォルトを3.12.0に設定
pyenv global 3.12.0

# 確認
python --version
# → Python 3.12.0 であることを確認

pip --version
# → pip 2x.x.x from ...python312... であることを確認
```

> ⚠️ `python` コマンドが「Microsoft Storeを開く」になってしまう場合:  
> 「Windowsの設定」→「アプリ」→「アプリ実行エイリアス」→ `python.exe` と `python3.exe` の **アプリインストーラーをOFF** にする。

---

### STEP 5: Node.js インストール（フロントエンド開発に必要）

1. https://nodejs.org/ja にアクセス
2. **LTS版**（推奨版）をダウンロード・インストール
3. インストール後、PowerShellを**新しく開き直して**確認:

```powershell
node --version
# → v20.x.x 以上であることを確認

npm --version
# → 10.x.x 以上であることを確認
```

---

### STEP 6: NVIDIA GPU ドライバーと CUDA Toolkit インストール

Stable Diffusion と SAM2 の GPU推論に必要。

#### 6-1. NVIDIA ドライバーの確認・更新

```powershell
# 現在のGPUドライバーバージョン確認
nvidia-smi
# → ドライバーのバージョンと CUDA Version が表示されればドライバーはインストール済み
# → 「コマンドが見つかりません」の場合はドライバーを先にインストールする
# → NVIDIA ドライバー: https://www.nvidia.com/ja-jp/geforce/drivers/
```

#### 6-2. CUDA Toolkit 12.1 インストール

1. https://developer.nvidia.com/cuda-12-1-0-download-archive にアクセス
2. OS: Windows → Architecture: x86_64 → Version: 11 or 10 → Installer Type: exe（local）を選択
3. ダウンロードして実行（インストールは「高速（推奨）」でOK）
4. インストール後、PowerShellを**新しく開き直して**確認:

```powershell
nvcc --version
# → Cuda compilation tools, release 12.1, V12.1.xxx であることを確認

# CUDA が GPU に認識されているか確認
nvidia-smi
# → CUDA Version: 12.1 以上が表示されればOK
```

---

### STEP 7: プロジェクトの作成とディレクトリ構造の準備

```powershell
# 開発用ディレクトリを作成（場所は好みで変えてOK）
mkdir C:\dev
cd C:\dev

# shiver プロジェクトディレクトリを作成
mkdir shiver
cd shiver

# 必要なサブディレクトリを作成
mkdir frontend
mkdir backend
mkdir gpu-server
mkdir .vscode

# VS Codeで開く
code .
```

---

### STEP 8: バックエンド（FastAPI）の仮想環境作成

**⚠️ 仮想環境は backend・gpu-server それぞれに別々に作成する。**  
ライブラリの依存関係が衝突するため、同じ venv を使い回さないこと。

```powershell
# backend の venv 作成
cd C:\dev\shiver\backend

python -m venv .venv

# 仮想環境を有効化
.venv\Scripts\activate
# → プロンプトの先頭に (.venv) が付けばOK

# pip を最新に更新（初回は必ずやる）
python -m pip install --upgrade pip

# 確認: 仮想環境のPythonが使われているか
where python
# → C:\dev\shiver\backend\.venv\Scripts\python.exe であることを確認
```

#### backend/requirements.txt を作成してインストール

```
# backend/requirements.txt
fastapi>=0.110.0
uvicorn[standard]
websockets
httpx
Pillow
numpy
pydantic>=2.0
python-multipart
aiofiles
google-genai>=1.0.0
python-dotenv
```

```powershell
# .venv が有効な状態で実行
pip install -r requirements.txt

# インストール確認
pip list
# → fastapi, uvicorn, httpx などが一覧に表示されればOK

# 仮想環境を抜ける（次のSTEPに移る前に）
deactivate
```

---

### STEP 9: GPU Server の仮想環境作成

PyTorch（CUDA版）は容量が大きいため、必ず別の venv に入れること。

```powershell
cd C:\dev\shiver\gpu-server

python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip

# PyTorch CUDA 12.1 版をインストール（通常版とは別URL）
# ⚠️ これは通常の pip install torch とは異なる。--index-url の指定が必須
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
# → ダウンロードに数分かかる（2GB以上あるので注意）

# インストール確認（CUDAが認識されているか）
python -c "import torch; print(torch.cuda.is_available())"
# → True であることを確認。False の場合はCUDA Toolkitの再インストールを試みる

python -c "import torch; print(torch.cuda.get_device_name(0))"
# → GPU名（例: NVIDIA GeForce RTX 3080）が表示されればOK
```

#### gpu-server/requirements.txt を作成してインストール

```
# gpu-server/requirements.txt
fastapi>=0.110.0
uvicorn[standard]
Pillow
numpy
python-dotenv
httpx
```

```powershell
pip install -r requirements.txt

# SAM2 インストール（GitHubから直接）
pip install git+https://github.com/facebookresearch/sam2.git
# → Successfully installed sam2-x.x.x が表示されればOK

# SAM2チェックポイントのダウンロード
# gpu-server/checkpoints/ ディレクトリを作成してダウンロード
mkdir checkpoints
cd checkpoints
# Windowsでは curl ではなく Invoke-WebRequest を使う
Invoke-WebRequest -Uri "https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt" -OutFile "sam2_hiera_large.pt"
# → ダウンロードに数分かかる（約900MB）
cd ..

deactivate
```

---

### STEP 10: フロントエンドの依存関係インストール

```powershell
cd C:\dev\shiver\frontend

# Vite + React + TypeScript プロジェクトを作成
npm create vite@latest . -- --template react-ts
# 「Current directory is not empty. Remove existing files and continue?」と聞かれたら y

# 依存関係インストール
npm install

# 追加パッケージのインストール
npm install pixi.js
npm install @mediapipe/tasks-vision
npm install zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 起動確認
npm run dev
# → http://localhost:5173 でViteの初期画面が表示されればOK
# Ctrl+C で停止
```

---

### STEP 11: Stable Diffusion WebUI（AUTOMATIC1111）セットアップ

```powershell
# shiver とは別ディレクトリに置く（容量が大きいため）
cd C:\dev
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui
```

**webui-user.bat をメモ帳で開いて以下の行を編集:**

```bat
set COMMANDLINE_ARGS=--api --listen --port 7860 --xformers
```

**アニメ系モデルのダウンロードと配置:**

```
1. 以下のどちらかのモデルをダウンロード:
   AnythingV5:     https://huggingface.co/stablediffusionapi/anything-v5
                   → Files → anything-v5-PrtRE.safetensors をDL
   Counterfeit-V3: https://huggingface.co/gsdf/Counterfeit-V3.0
                   → Files → Counterfeit-V3.0_fp16.safetensors をDL

2. ダウンロードしたファイルを以下に配置:
   C:\dev\stable-diffusion-webui\models\Stable-diffusion\
```

```powershell
# 初回起動（依存関係の自動インストールが走るため10〜20分かかる）
.\webui-user.bat
# → ブラウザで http://localhost:7860 が自動で開く
# → 画面が表示されたら http://localhost:7860/docs にアクセス
# → Swagger UI が表示されれば API 有効化成功
# Ctrl+C で停止（普段はshiver起動時に別途立ち上げる）
```

---

### STEP 12: .env ファイルの作成

**セキュリティ上、.env ファイルは絶対に Git にコミットしないこと。**  
`.gitignore` に `*.env` が含まれていることを確認する。

```powershell
# .gitignore を作成（プロジェクトルート）
cd C:\dev\shiver
@"
.env
*.env
backend/.venv/
gpu-server/.venv/
frontend/node_modules/
frontend/dist/
__pycache__/
*.pyc
"@ | Out-File -FilePath .gitignore -Encoding utf8
```

```bash
# backend/.env
GPU_SERVER_HOST=localhost
GPU_SERVER_SD_PORT=7860
GPU_SERVER_SAM2_PORT=8001
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173
GEMINI_API_KEY=your_google_ai_studio_api_key_here
# ↑ Google AI Studio (https://aistudio.google.com/apikey) でAPIキーを発行して入力
```

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

```bash
# gpu-server/.env
PORT=8001
```

---

### STEP 13: VS Code ワークスペース設定ファイルの作成

プロジェクトを VS Code で開いた状態で以下のファイルを作成する。

```powershell
# .vscode ディレクトリはSTEP 7で作成済み
cd C:\dev\shiver
```

**`.vscode/settings.json` を VS Code で作成して以下を貼り付ける:**

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.python"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "files.eol": "\n"
}
```

**`.vscode/launch.json` を作成して以下を貼り付ける（F5で起動できるデバッグ設定）:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastAPI バックエンド",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload", "--port", "8000"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/backend/.env"
    },
    {
      "name": "GPU Server (SAM2)",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["server:app", "--reload", "--port", "8001"],
      "cwd": "${workspaceFolder}/gpu-server",
      "envFile": "${workspaceFolder}/gpu-server/.env"
    }
  ],
  "compounds": [
    {
      "name": "🚀 全サーバー起動",
      "configurations": ["FastAPI バックエンド", "GPU Server (SAM2)"]
    }
  ]
}
```

> **使い方:** VS Code の「実行とデバッグ」（Ctrl+Shift+D）を開き、「🚀 全サーバー起動」を選んで再生ボタンを押すと、バックエンドとGPUサーバーが同時に起動する。

---

### STEP 14: 全環境の最終確認チェックリスト

以下を上から順に実行して、全て ✅ になってから開発を開始すること。

```powershell
# ── ツール確認 ──
git --version          # ✅ git version 2.4x.x
code --version         # ✅ 1.9x.x
python --version       # ✅ Python 3.12.0
node --version         # ✅ v20.x.x
npm --version          # ✅ 10.x.x
nvcc --version         # ✅ release 12.1
nvidia-smi             # ✅ GPU名とCUDA Versionが表示される

# ── Python仮想環境確認 ──
cd C:\dev\shiver\backend
.venv\Scripts\activate
python -c "import fastapi, uvicorn; print('backend OK')"   # ✅ backend OK
deactivate

cd C:\dev\shiver\gpu-server
.venv\Scripts\activate
python -c "import torch; print('CUDA:', torch.cuda.is_available())"  # ✅ CUDA: True
python -c "import sam2; print('SAM2 OK')"                            # ✅ SAM2 OK
deactivate

# ── フロントエンド確認 ──
cd C:\dev\shiver\frontend
npm run dev
# ✅ http://localhost:5173 でVite画面が表示される（Ctrl+Cで停止）

# ── SD WebUI 確認（別ターミナルで） ──
cd C:\dev\stable-diffusion-webui
.\webui-user.bat
# ✅ http://localhost:7860 が表示される（Ctrl+Cで停止）
```

---

### 2.3 1台構成における通信設計

v3.1からバックエンドとGPUサーバーが同一マシンになったため、全てlocalhost通信になる。

```bash
# backend/.env（再掲）
GPU_SERVER_HOST=localhost        # ← 以前の2台構成では 192.168.1.200 だった
GPU_SERVER_SD_PORT=7860
GPU_SERVER_SAM2_PORT=8001
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173
GEMINI_API_KEY=your_google_ai_studio_api_key
```

> **ファイアウォール設定不要**: 同一マシン内のlocalhost通信なので外部へのポート開放は不要。

### 2.6 ディレクトリ構成（完成形）

```
shiver/
├── README.md
├── TECHNICAL_BOOK.md              # この技術書
├── .env.example
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── AvatarCanvas.tsx         # PixiJSレンダリング統合
│       │   ├── CameraCapture.tsx        # カメラ映像（非表示）
│       │   ├── PartEditor.tsx           # 手動補正UI
│       │   ├── PromptInput.tsx          # キャラ生成
│       │   ├── ExpressionPanel.tsx      # キーバインド表情UI
│       │   └── ErrorToast.tsx           # 日本語エラー表示
│       ├── hooks/
│       │   ├── useFaceTracking.ts       # MediaPipe連携
│       │   ├── useWebSocket.ts          # WebSocket（自動再接続）
│       │   └── useAvatarState.ts        # Zustand状態管理
│       ├── types/
│       │   ├── avatar.ts                # アバター型定義
│       │   └── faceTracking.ts          # 顔追跡型定義
│       └── utils/
│           ├── pixiRenderer.ts          # PixiJS描画ロジック
│           ├── faceMapper.ts            # ランドマーク→パラメータ変換
│           ├── physicsEngine.ts         # 物理演算（髪揺れ）
│           └── idleAnimator.ts          # アイドルアニメ（呼吸・まばたき）
├── backend/
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/
│   │   ├── generation.py
│   │   ├── segmentation.py
│   │   └── avatar.py
│   ├── services/
│   │   ├── image_generator.py           # SD/Gemini抽象化
│   │   ├── stable_diffusion.py
│   │   ├── gemini_image.py
│   │   └── sam2_service.py
│   └── models/schemas.py
└── gpu-server/
    ├── requirements.txt
    ├── server.py
    └── sam2_api.py
```

---

## 3. システムアーキテクチャ

### 3.1 全体パイプライン

```
[PHASE 1: 生成]
プロンプト入力 → ImageGenerator → SD (優先) / Gemini 2.5 Flash Image (フォールバック)
→ 4枚生成 → ユーザー選択

[PHASE 2: 分割]
選択画像 → MediaPipe Face Mesh（正規化座標取得）
→ normalized_to_pixel() 変換（必須）
→ SAM2自動セグメンテーション（GPU Server）

分割対象パーツ（v3.0拡張版）:
  顔: face / nose / mouth
  目（3層）: left_pupil / left_white / left_upper_lid
             right_pupil / right_white / right_upper_lid
  眉: left_brow / right_brow
  頬: blush_left / blush_right
  髪: hair_back / hair_front / hair_side_left / hair_side_right
→ 手動補正UI → 各パーツPNG（背景透過）保存

[PHASE 3: リギング]
各パーツ → PixiJS Sprite配置（zIndex・parallax・anchorPoint設定）
物理演算設定: hair_* パーツに SpringChain を自動アタッチ

[PHASE 4: リアルタイム処理（毎フレーム実行）]

┌─────────────────────────────────────────────────┐
│ requestAnimationFrame ループ（~60fps）           │
│                                                  │
│  [A] MediaPipe 顔追跡                           │
│      → faceMapper.ts でパラメータ変換           │
│      → 適応閾値で個人差吸収                     │
│                                                  │
│  [B] idleAnimator.ts（常時実行）                │
│      → 自動まばたき（3〜5秒ランダム周期）       │
│      → 呼吸モーション（サインカーブ）           │
│      ※ [A]の結果と合成してfinalParamsを生成    │
│                                                  │
│  [C] physicsEngine.ts（常時実行）               │
│      → 髪揺れ物理演算（バネ振り子）            │
│      → head_yaw/pitchを入力として揺れを計算    │
│                                                  │
│  [D] キーバインド表情（割り込み処理）           │
│      → 発動中は一部パラメータをオーバーライド  │
│                                                  │
│  [E] pixiRenderer.ts                           │
│      → finalParams + 物理演算結果で描画更新    │
└─────────────────────────────────────────────────┘

[PHASE 5: 出力]
Webブラウザプレビュー（backgroundAlpha: 0）
→ OBS ブラウザソース → Virtual Camera → 配信
```

### 3.2 通信アーキテクチャ

```
[ブラウザ]
  ↕ REST API   : 画像生成・セグメント・プロジェクト保存
  ↕ WebSocket  : 顔パラメータストリーム（自動再接続付き）
[FastAPI localhost:8000]
  ↕ REST (localhost)
[GPU Server localhost:7860/8001]
※ v3.1から同一Windows機内のlocalhost通信に統一
```

---

## 4. 技術スタック

### 4.1 フロントエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| React | 18.x | UIフレームワーク |
| TypeScript | 5.x | 型安全 |
| Vite | 5.x | ビルドツール |
| PixiJS | 7.x | 2D WebGLレンダリング |
| @mediapipe/tasks-vision | latest | 顔追跡（WebAssembly） |
| Zustand | 4.x | 状態管理 |
| TailwindCSS | 3.x | スタイリング |

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install pixi.js
npm install @mediapipe/tasks-vision
npm install zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 4.2 バックエンド requirements.txt

```
fastapi>=0.110.0
uvicorn[standard]
websockets
httpx
Pillow
numpy
pydantic>=2.0
python-multipart
aiofiles
google-genai>=1.0.0
python-dotenv
```

### 4.3 GPU Server requirements.txt

```
fastapi>=0.110.0
uvicorn[standard]
# PyTorch CUDA版: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
Pillow
numpy
python-dotenv
# SAM2: pip install git+https://github.com/facebookresearch/sam2.git
```

---

## 5. 型定義（TypeScript）

```typescript
// frontend/src/types/avatar.ts

// ===== パーツID一覧（v3.0拡張・目3層分割対応）=====
export type AvatarPartId =
  // 顔
  | "hair_back"
  | "face"
  | "nose"
  // 目（3層）
  | "left_white"   | "right_white"    // 白目
  | "left_pupil"   | "right_pupil"    // 瞳
  | "left_upper_lid" | "right_upper_lid" // 上まぶた
  // 眉
  | "left_brow"    | "right_brow"
  // 口
  | "mouth"
  // 頬染め
  | "blush_left"   | "blush_right"
  // 髪（物理演算対象）
  | "hair_front"
  | "hair_side_left" | "hair_side_right";

export interface AvatarPart {
  id: AvatarPartId;
  name: string;
  imageUrl: string;
  anchorX: number;       // 変形基準点X (0.0〜1.0)
  anchorY: number;       // 変形基準点Y (0.0〜1.0)
  baseX: number;         // キャンバス上の基準X（ピクセル）
  baseY: number;         // キャンバス上の基準Y（ピクセル）
  baseWidth: number;
  baseHeight: number;
  zIndex: number;
  parallax: number;      // 視差スクロール係数 (0.0〜1.0)
  hasPhysics: boolean;   // trueのとき物理演算対象
  physicsConfig?: PhysicsConfig; // 物理演算設定
}

// ===== 物理演算設定 =====
export interface PhysicsConfig {
  stiffness: number;    // バネ剛性 (0.0〜1.0)  高いほど動きが小さい
  damping: number;      // 減衰係数 (0.0〜1.0)  高いほど早く止まる
  gravity: number;      // 重力影響度 (0.0〜1.0)
  maxAngle: number;     // 最大揺れ角度（度）
}

// ===== 顔追跡パラメータ =====
export interface AvatarParameters {
  // 目
  blink_left: number;      // 0.0(閉)〜1.0(開)
  blink_right: number;
  pupil_x: number;         // -1.0(左)〜1.0(右)  ← v3.0追加
  pupil_y: number;         // -1.0(上)〜1.0(下)  ← v3.0追加
  // 口
  mouth_open: number;      // 0.0〜1.0
  // 眉
  brow_left: number;       // -1.0(下)〜1.0(上)
  brow_right: number;
  // 頭の向き
  head_yaw: number;        // -30〜30度
  head_pitch: number;      // -20〜20度
  head_roll: number;       // -15〜15度  ← v3.0追加（首傾げ）
  // 感情・演出
  emotion: EmotionType;
  blush_intensity: number; // 0.0〜1.0
  // アイドルアニメ（idleAnimatorが書き込む）
  breath_offset: number;   // -3〜3px 呼吸によるY移動量  ← v3.0追加
  auto_blink: number;      // 0.0〜1.0 自動まばたき値   ← v3.0追加
}

// ===== 感情タイプ =====
export type EmotionType =
  | "neutral"
  | "happy"       // 笑顔（目細め）
  | "blush"       // 照れ頬染め
  | "sad"         // 泣き顔
  | "angry"       // 怒り
  | "surprised";  // サプライズ（見開き目）

// ===== キーバインド設定 =====
export interface KeyBinding {
  key: string;           // キーボードキー（例: "q", "w", "1"）
  emotion: EmotionType;
  label: string;         // UI表示名
  durationMs: number;    // 発動時間（ms）。0=トグル
}

export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  { key: "1", emotion: "blush",     label: "照れ",           durationMs: 3000 },
  { key: "2", emotion: "sad",       label: "泣き顔",         durationMs: 0    },
  { key: "3", emotion: "angry",     label: "怒り",           durationMs: 0    },
  { key: "4", emotion: "surprised", label: "サプライズ",     durationMs: 2000 },
  { key: "5", emotion: "happy",     label: "笑顔",           durationMs: 0    },
  // ウィンクはemotionとは別系統で管理
];

// ===== アバタープロジェクト =====
export interface AvatarProject {
  id: string;
  name: string;
  sourceImageUrl: string;
  parts: AvatarPart[];
  keyBindings: KeyBinding[];
  createdAt: string;
}
```

---

## 6. パーツ設定定数

```typescript
// frontend/src/utils/partConfig.ts
import { AvatarPartId, AvatarPart } from "../types/avatar";

// zIndex・parallax・物理演算設定の定数定義
// これをベースにSAM2分割後の自動リギングで使用する
export const PART_CONFIG: Record<AvatarPartId, {
  zIndex: number;
  parallax: number;
  hasPhysics: boolean;
  physicsConfig?: { stiffness: number; damping: number; gravity: number; maxAngle: number; }
}> = {
  hair_back:       { zIndex: 100,  parallax: 0.25, hasPhysics: true,
                     physicsConfig: { stiffness: 0.15, damping: 0.7, gravity: 0.3, maxAngle: 18 } },
  face:            { zIndex: 300,  parallax: 0.5,  hasPhysics: false },
  left_white:      { zIndex: 500,  parallax: 0.7,  hasPhysics: false },
  right_white:     { zIndex: 500,  parallax: 0.7,  hasPhysics: false },
  left_pupil:      { zIndex: 600,  parallax: 0.72, hasPhysics: false },
  right_pupil:     { zIndex: 600,  parallax: 0.72, hasPhysics: false },
  left_upper_lid:  { zIndex: 700,  parallax: 0.71, hasPhysics: false },
  right_upper_lid: { zIndex: 700,  parallax: 0.71, hasPhysics: false },
  left_brow:       { zIndex: 400,  parallax: 0.75, hasPhysics: false },
  right_brow:      { zIndex: 400,  parallax: 0.75, hasPhysics: false },
  nose:            { zIndex: 800,  parallax: 0.6,  hasPhysics: false },
  mouth:           { zIndex: 900,  parallax: 0.65, hasPhysics: false },
  blush_left:      { zIndex: 1000, parallax: 0.55, hasPhysics: false },
  blush_right:     { zIndex: 1000, parallax: 0.55, hasPhysics: false },
  hair_front:      { zIndex: 1100, parallax: 0.9,  hasPhysics: true,
                     physicsConfig: { stiffness: 0.2, damping: 0.65, gravity: 0.25, maxAngle: 12 } },
  hair_side_left:  { zIndex: 1050, parallax: 0.85, hasPhysics: true,
                     physicsConfig: { stiffness: 0.18, damping: 0.68, gravity: 0.28, maxAngle: 15 } },
  hair_side_right: { zIndex: 1050, parallax: 0.85, hasPhysics: true,
                     physicsConfig: { stiffness: 0.18, damping: 0.68, gravity: 0.28, maxAngle: 15 } },
};
```

---

## 7. 物理演算エンジン（髪揺れ）

```typescript
// frontend/src/utils/physicsEngine.ts
/**
 * バネ振り子による髪揺れ物理演算
 *
 * 仕組み:
 *   - head_yaw/pitchをバネへの外力として入力
 *   - 各フレームで速度・位置を更新（オイラー積分）
 *   - 出力はX/Yオフセット（ピクセル）とZ回転（ラジアン）
 *
 * Live2Dの物理演算を参考に実装:
 *   - 前髪は短いので stiffness高め（すぐ戻る）
 *   - 後ろ髪は長いので stiffness低め（ゆっくり揺れる）
 */

import { PhysicsConfig } from "../types/avatar";

export interface PhysicsState {
  velocityX: number;
  velocityY: number;
  offsetX: number;
  offsetY: number;
  angle: number;       // Z回転（ラジアン）
  angularVelocity: number;
}

export function createPhysicsState(): PhysicsState {
  return { velocityX: 0, velocityY: 0, offsetX: 0, offsetY: 0, angle: 0, angularVelocity: 0 };
}

export function updatePhysics(
  state: PhysicsState,
  config: PhysicsConfig,
  headYaw: number,    // 度
  headPitch: number,  // 度
  deltaTime: number,  // 秒（通常 1/60）
): PhysicsState {
  const dt = Math.min(deltaTime, 0.05); // 最大50msでクランプ（スパイク防止）

  // 外力: 頭の動きをバネへの入力にする
  const forceX = -headYaw   * 0.03;
  const forceY =  headPitch * 0.02 + config.gravity * 9.8 * dt;

  // バネ力（フックの法則）: 変位に比例して原点に引き戻す
  const springForceX = -state.offsetX * config.stiffness * 80;
  const springForceY = -state.offsetY * config.stiffness * 80;

  // 速度更新（オイラー積分）
  const newVelX = (state.velocityX + (forceX + springForceX) * dt) * (1 - config.damping * dt * 10);
  const newVelY = (state.velocityY + (forceY + springForceY) * dt) * (1 - config.damping * dt * 10);

  // 位置更新
  const newOffsetX = state.offsetX + newVelX * dt * 60;
  const newOffsetY = state.offsetY + newVelY * dt * 60;

  // 角度（Z回転）: オフセットXからZ回転を計算
  const targetAngle = newOffsetX * 0.008;
  const angularSpring = -state.angle * config.stiffness * 60;
  const newAngularVel = (state.angularVelocity + (targetAngle - state.angle + angularSpring) * dt * 5)
                        * (1 - config.damping * dt * 8);
  const newAngle = state.angle + newAngularVel * dt * 30;

  // 最大揺れ角度でクランプ
  const maxRad = (config.maxAngle * Math.PI) / 180;
  const clampedAngle = Math.max(-maxRad, Math.min(maxRad, newAngle));

  return {
    velocityX: newVelX,
    velocityY: newVelY,
    offsetX: Math.max(-30, Math.min(30, newOffsetX)),
    offsetY: Math.max(-20, Math.min(20, newOffsetY)),
    angle: clampedAngle,
    angularVelocity: newAngularVel,
  };
}
```

---

## 8. アイドルアニメーター（呼吸・自動まばたき）

```typescript
// frontend/src/utils/idleAnimator.ts
/**
 * 常時動作するアイドルアニメーション
 *
 * ① 呼吸モーション: 周期4秒のサインカーブでY座標を±3px動かす
 * ② 自動まばたき: 3〜5秒のランダム間隔で0.15秒かけてまばたき
 *
 * これらは顔追跡の結果と合成してfinalParamsを作る。
 * 顔が検出されない時もアバターは「生きている」状態を維持する。
 */

export interface IdleState {
  // 呼吸
  breathPhase: number;         // 0〜2π の位相

  // 自動まばたき
  nextBlinkTime: number;       // 次のまばたき開始時刻（ms）
  blinkPhase: "open" | "closing" | "opening";
  blinkProgress: number;       // 0.0〜1.0
}

export function createIdleState(): IdleState {
  return {
    breathPhase: 0,
    nextBlinkTime: Date.now() + randomBlinkInterval(),
    blinkPhase: "open",
    blinkProgress: 0,
  };
}

function randomBlinkInterval(): number {
  // 3000〜5000msのランダム間隔
  return 3000 + Math.random() * 2000;
}

const BREATH_PERIOD_MS = 4000;    // 呼吸周期（ms）
const BREATH_AMPLITUDE = 3;       // 呼吸Y振幅（px）
const BLINK_CLOSE_MS = 80;        // まばたき：閉じる時間
const BLINK_OPEN_MS  = 120;       // まばたき：開く時間

export interface IdleOutput {
  breathOffsetY: number;    // 呼吸によるY移動量（px）
  autoBlinkValue: number;   // 自動まばたき値（0=閉, 1=開）
}

export function updateIdle(state: IdleState, now: number, deltaMs: number): { state: IdleState; output: IdleOutput } {
  // ── 呼吸 ──
  const newBreathPhase = (state.breathPhase + (deltaMs / BREATH_PERIOD_MS) * 2 * Math.PI) % (2 * Math.PI);
  const breathOffsetY = Math.sin(newBreathPhase) * BREATH_AMPLITUDE;

  // ── 自動まばたき ──
  let { nextBlinkTime, blinkPhase, blinkProgress } = state;
  let autoBlinkValue = 1.0; // デフォルト：目開き

  if (blinkPhase === "open") {
    if (now >= nextBlinkTime) {
      blinkPhase = "closing";
      blinkProgress = 0;
    }
  } else if (blinkPhase === "closing") {
    blinkProgress += deltaMs / BLINK_CLOSE_MS;
    if (blinkProgress >= 1.0) {
      blinkProgress = 0;
      blinkPhase = "opening";
    }
    autoBlinkValue = 1.0 - blinkProgress;  // 1→0 （開→閉）
  } else { // opening
    blinkProgress += deltaMs / BLINK_OPEN_MS;
    if (blinkProgress >= 1.0) {
      blinkPhase = "open";
      blinkProgress = 0;
      nextBlinkTime = now + randomBlinkInterval();
    }
    autoBlinkValue = blinkProgress;  // 0→1 （閉→開）
  }

  return {
    state: { breathPhase: newBreathPhase, nextBlinkTime, blinkPhase, blinkProgress },
    output: { breathOffsetY, autoBlinkValue },
  };
}
```

---

## 9. 顔追跡パラメータ変換（瞳XY追跡対応）

```typescript
// frontend/src/utils/faceMapper.ts
import { NormalizedLandmark, Category } from "@mediapipe/tasks-vision";
import { AvatarParameters } from "../types/avatar";

// =========================================
// リアルタイム適応閾値
// 直近30フレームの移動平均で個人差・照明差を吸収
// =========================================
export class AdaptiveThreshold {
  private buffer: number[] = [];
  private readonly windowSize: number;
  private mean: number;
  private std: number;

  constructor(windowSize = 30, initialMean = 0.28) {
    this.windowSize = windowSize;
    this.mean = initialMean;
    this.std = 0.05;
  }

  update(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    if (this.buffer.length >= 5) {
      this.mean = this.buffer.reduce((a, b) => a + b) / this.buffer.length;
      const variance = this.buffer.reduce((a, b) => a + (b - this.mean) ** 2, 0) / this.buffer.length;
      this.std = Math.sqrt(variance);
    }
  }

  normalize(value: number): number {
    const closed = this.mean - this.std * 0.8;
    const open   = this.mean + this.std * 0.5;
    return Math.min(1.0, Math.max(0.0, (value - closed) / (open - closed)));
  }
}

const earLeftThreshold  = new AdaptiveThreshold(30, 0.28);
const earRightThreshold = new AdaptiveThreshold(30, 0.28);
const marThreshold      = new AdaptiveThreshold(30, 0.05);

function calcEAR(p: NormalizedLandmark[]): number {
  const v1 = Math.abs(p[1].y - p[5].y);
  const v2 = Math.abs(p[2].y - p[4].y);
  const h  = Math.abs(p[0].x - p[3].x);
  return h === 0 ? 0.3 : (v1 + v2) / (2.0 * h);
}

function calcMAR(p: NormalizedLandmark[]): number {
  const v = Math.abs(p[2].y - p[6].y);
  const h = Math.abs(p[0].x - p[4].x);
  return h === 0 ? 0.0 : v / h;
}

// =========================================
// FaceBlendshapesから瞳XYを計算
// eyeLookIn/Out/Up/Down の4方向のブレンドシェイプ値を使う
// =========================================
function calcPupilXY(blendshapes: Category[]): { x: number; y: number } {
  const get = (name: string) => blendshapes.find(b => b.categoryName === name)?.score ?? 0;

  const lookLeft  = get("eyeLookOut_L");   // 左目が左を向く
  const lookRight = get("eyeLookIn_L");    // 左目が右を向く
  const lookUp    = get("eyeLookUp_L");
  const lookDown  = get("eyeLookDown_L");

  // -1.0〜1.0 に正規化
  const x = Math.min(1.0, Math.max(-1.0, lookRight - lookLeft));
  const y = Math.min(1.0, Math.max(-1.0, lookDown  - lookUp));

  return { x, y };
}

// =========================================
// メイン変換関数
// =========================================
export function mapLandmarksToParams(
  landmarks: NormalizedLandmark[],
  blendshapes: Category[]
): AvatarParameters {
  if (landmarks.length < 468) {
    return getDefaultParams();
  }

  // EAR（まばたき）
  const leftEyePts  = [33,  160, 158, 133, 153, 144].map(i => landmarks[i]);
  const rightEyePts = [362, 385, 387, 263, 373, 380].map(i => landmarks[i]);
  const earLeft  = calcEAR(leftEyePts);
  const earRight = calcEAR(rightEyePts);
  earLeftThreshold.update(earLeft);
  earRightThreshold.update(earRight);

  // MAR（口開閉）
  const mouthPts = [61, 39, 0, 269, 291, 405, 17, 14].map(i => landmarks[i]);
  const mar = calcMAR(mouthPts);
  marThreshold.update(mar);

  // 瞳XY（ブレンドシェイプから）
  const pupil = calcPupilXY(blendshapes);

  // 眉の上下
  const browLeftY  = landmarks[66].y;
  const browRightY = landmarks[296].y;
  const eyeLeftY   = landmarks[159].y;
  const eyeRightY  = landmarks[386].y;
  const browLeft  = Math.min(1.0, Math.max(-1.0, (eyeLeftY  - browLeftY  - 0.06) * 8));
  const browRight = Math.min(1.0, Math.max(-1.0, (eyeRightY - browRightY - 0.06) * 8));

  // 頭の向き（ヨー・ピッチ・ロール）
  const noseX    = landmarks[1].x;
  const leftEarX = landmarks[454].x;
  const rightEarX = landmarks[234].x;
  const headYaw   = Math.min(30, Math.max(-30, (noseX - (leftEarX + rightEarX) / 2) * 60));

  const noseY    = landmarks[1].y;
  const faceTopY = landmarks[10].y;
  const faceBotY = landmarks[152].y;
  const headPitch = Math.min(20, Math.max(-20, (noseY - (faceTopY + faceBotY) / 2) * 40));

  // ロール（首傾げ）: 両目の高さの差から計算
  const eyeLY = landmarks[159].y;
  const eyeRY = landmarks[386].y;
  const headRoll = Math.min(15, Math.max(-15, (eyeRY - eyeLY) * 120));

  return {
    blink_left:  earLeftThreshold.normalize(earLeft),
    blink_right: earRightThreshold.normalize(earRight),
    pupil_x: pupil.x,
    pupil_y: pupil.y,
    mouth_open:  marThreshold.normalize(mar),
    brow_left:   browLeft,
    brow_right:  browRight,
    head_yaw:    headYaw,
    head_pitch:  headPitch,
    head_roll:   headRoll,
    emotion:     "neutral",
    blush_intensity: 0.0,
    breath_offset: 0,   // idleAnimatorが上書きする
    auto_blink:    1.0, // idleAnimatorが上書きする
  };
}

function getDefaultParams(): AvatarParameters {
  return {
    blink_left: 1.0, blink_right: 1.0,
    pupil_x: 0, pupil_y: 0,
    mouth_open: 0.0, brow_left: 0.0, brow_right: 0.0,
    head_yaw: 0.0, head_pitch: 0.0, head_roll: 0.0,
    emotion: "neutral", blush_intensity: 0.0,
    breath_offset: 0, auto_blink: 1.0,
  };
}
```

---

## 10. PixiJSレンダラー（全機能統合）

```typescript
// frontend/src/utils/pixiRenderer.ts
import * as PIXI from "pixi.js";
import { AvatarPart, AvatarParameters, AvatarPartId, EmotionType } from "../types/avatar";
import { PhysicsState, createPhysicsState, updatePhysics } from "./physicsEngine";

interface SpriteEx extends PIXI.Sprite {
  baseX: number;
  baseY: number;
}

export class AvatarRenderer {
  private app: PIXI.Application;
  private sprites   = new Map<AvatarPartId, SpriteEx>();
  private parts     = new Map<AvatarPartId, AvatarPart>();
  private physics   = new Map<AvatarPartId, PhysicsState>();
  private lastTime  = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      width: 512, height: 768,
      backgroundColor: 0x000000,
      backgroundAlpha: 0,   // 背景透過（OBS連携に必須）
      antialias: true,
    });
    this.app.stage.sortableChildren = true;
  }

  loadParts(parts: AvatarPart[]) {
    this.app.stage.removeChildren();
    this.sprites.clear();
    this.parts.clear();
    this.physics.clear();

    parts.forEach(part => {
      const sprite = PIXI.Sprite.from(part.imageUrl) as SpriteEx;
      sprite.anchor.set(part.anchorX, part.anchorY);
      sprite.x = part.baseX;
      sprite.y = part.baseY;
      sprite.width  = part.baseWidth;
      sprite.height = part.baseHeight;
      sprite.zIndex = part.zIndex;
      sprite.baseX  = part.baseX;
      sprite.baseY  = part.baseY;

      this.app.stage.addChild(sprite);
      this.sprites.set(part.id, sprite);
      this.parts.set(part.id, part);

      if (part.hasPhysics) {
        this.physics.set(part.id, createPhysicsState());
      }
    });
  }

  updateParameters(params: AvatarParameters) {
    const now      = performance.now();
    const deltaTime = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime  = now;

    // 最終的なまばたき値 = 顔追跡 × 自動まばたき（AND合成）
    const finalBlinkL = params.blink_left  * params.auto_blink;
    const finalBlinkR = params.blink_right * params.auto_blink;

    // ──── 目（3層）────
    // 上まぶた: まばたきで縦スケール変化
    const lidL = this.sprites.get("left_upper_lid");
    const lidR = this.sprites.get("right_upper_lid");
    if (lidL) lidL.scale.y = Math.max(0.05, finalBlinkL);
    if (lidR) lidR.scale.y = Math.max(0.05, finalBlinkR);

    // 白目: まばたきで縦スケール変化（まぶたより少し遅れる）
    const whiteL = this.sprites.get("left_white");
    const whiteR = this.sprites.get("right_white");
    if (whiteL) whiteL.scale.y = Math.max(0.1, finalBlinkL * 0.9);
    if (whiteR) whiteR.scale.y = Math.max(0.1, finalBlinkR * 0.9);

    // 瞳: XY移動（視線追跡）+ まばたきで縦スケール
    const PUPIL_RANGE = 8; // 瞳の移動範囲（px）
    const pupilL = this.sprites.get("left_pupil");
    const pupilR = this.sprites.get("right_pupil");
    if (pupilL) {
      const base = this.parts.get("left_pupil")!;
      pupilL.x       = base.baseX + params.pupil_x * PUPIL_RANGE;
      pupilL.y       = base.baseY + params.pupil_y * PUPIL_RANGE;
      pupilL.scale.y = Math.max(0.05, finalBlinkL);
    }
    if (pupilR) {
      const base = this.parts.get("right_pupil")!;
      pupilR.x       = base.baseX + params.pupil_x * PUPIL_RANGE;
      pupilR.y       = base.baseY + params.pupil_y * PUPIL_RANGE;
      pupilR.scale.y = Math.max(0.05, finalBlinkR);
    }

    // サプライズ表情のとき目を見開く（スケールY > 1）
    if (params.emotion === "surprised") {
      [lidL, lidR, whiteL, whiteR, pupilL, pupilR].forEach(s => {
        if (s) s.scale.y = Math.min(1.2, s.scale.y + 0.2);
      });
    }

    // ──── 口 ────
    const mouth = this.sprites.get("mouth");
    if (mouth) {
      mouth.scale.y = params.emotion === "happy"
        ? 0.5 + 0.3 * params.mouth_open  // 笑顔は口角上がり気味（後で形状差分と置き換え）
        : 0.6 + 0.6 * params.mouth_open;
    }

    // ──── 眉 ────
    const browL = this.sprites.get("left_brow");
    const browR = this.sprites.get("right_brow");
    const BROW_RANGE = 12;
    if (browL) {
      const base = this.parts.get("left_brow")!;
      const angryOffset = params.emotion === "angry" ? 8 : 0;
      browL.y = base.baseY - params.brow_left  * BROW_RANGE + angryOffset;
      // 怒り: 内側眉を下げる（X方向にも少しずらす）
      if (params.emotion === "angry") browL.x = base.baseX + 4;
      else browL.x = base.baseX;
    }
    if (browR) {
      const base = this.parts.get("right_brow")!;
      const angryOffset = params.emotion === "angry" ? 8 : 0;
      browR.y = base.baseY - params.brow_right * BROW_RANGE + angryOffset;
      if (params.emotion === "angry") browR.x = base.baseX - 4;
      else browR.x = base.baseX;
    }

    // ──── 頬染め ────
    let blushAlpha = params.blush_intensity;
    if (params.emotion === "blush")     blushAlpha = Math.min(1.0, blushAlpha + 0.7);
    if (params.emotion === "happy")     blushAlpha = Math.min(1.0, blushAlpha + 0.3);
    if (params.emotion === "sad")       blushAlpha = Math.min(0.3, blushAlpha + 0.1);
    const blL = this.sprites.get("blush_left");
    const blR = this.sprites.get("blush_right");
    if (blL) blL.alpha = blushAlpha;
    if (blR) blR.alpha = blushAlpha;

    // ──── 視差スクロール（首振り）＋ 呼吸 ────
    // ⚠️ skewは使わない。必ず各パーツのX/Y座標をparallax係数で個別移動させること
    const YAW_SCALE   = 2.5;
    const PITCH_SCALE = 1.5;
    const ROLL_SCALE  = 1.0;

    this.sprites.forEach((sprite, partId) => {
      const part = this.parts.get(partId);
      if (!part) return;

      // 首振り（視差）
      const dx = params.head_yaw   * part.parallax * YAW_SCALE;
      const dy = params.head_pitch * part.parallax * PITCH_SCALE;
      // 首傾げ（ロール）: 顔中心を軸にX方向のオフセット
      const rollDx = params.head_roll * (sprite.baseY - 384) * 0.005 * part.parallax * ROLL_SCALE;

      // 呼吸モーション（全パーツに適用）
      const breathDy = params.breath_offset * part.parallax;

      if (!part.hasPhysics) {
        sprite.x = sprite.baseX + dx + rollDx;
        sprite.y = sprite.baseY + dy + breathDy;
      }
    });

    // ──── 物理演算（髪揺れ）────
    this.physics.forEach((physState, partId) => {
      const part   = this.parts.get(partId);
      const sprite = this.sprites.get(partId);
      if (!part?.physicsConfig || !sprite) return;

      const newState = updatePhysics(
        physState, part.physicsConfig,
        params.head_yaw, params.head_pitch, deltaTime
      );
      this.physics.set(partId, newState);

      const baseX = sprite.baseX + params.head_yaw * part.parallax * YAW_SCALE;
      const baseY = sprite.baseY + params.head_pitch * part.parallax * PITCH_SCALE + params.breath_offset * part.parallax;

      sprite.x        = baseX + newState.offsetX;
      sprite.y        = baseY + newState.offsetY;
      sprite.rotation = newState.angle;
    });
  }

  destroy() { this.app.destroy(true); }
}
```

---

## 11. キーバインド表情システム

```typescript
// frontend/src/hooks/useKeyBindings.ts
import { useEffect, useRef, useCallback } from "react";
import { EmotionType, KeyBinding, DEFAULT_KEY_BINDINGS } from "../types/avatar";

interface WinkState {
  left: boolean;
  right: boolean;
}

export function useKeyBindings(
  onEmotionChange: (emotion: EmotionType, intensity: number) => void,
  onWinkChange: (wink: WinkState) => void,
) {
  const activeEmotionRef = useRef<EmotionType>("neutral");
  const emotionTimerRef  = useRef<ReturnType<typeof setTimeout>>();
  const winkRef = useRef<WinkState>({ left: false, right: false });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // デフォルトキーバインド
    const binding = DEFAULT_KEY_BINDINGS.find(b => b.key === e.key);
    if (binding) {
      clearTimeout(emotionTimerRef.current);
      // トグル動作: 同じ感情キーを2度押すとneutralに戻る
      if (activeEmotionRef.current === binding.emotion && binding.durationMs === 0) {
        activeEmotionRef.current = "neutral";
        onEmotionChange("neutral", 0);
      } else {
        activeEmotionRef.current = binding.emotion;
        onEmotionChange(binding.emotion, 1.0);
        if (binding.durationMs > 0) {
          emotionTimerRef.current = setTimeout(() => {
            activeEmotionRef.current = "neutral";
            onEmotionChange("neutral", 0);
          }, binding.durationMs);
        }
      }
    }

    // ウィンク（qキー=左ウィンク、eキー=右ウィンク）
    if (e.key === "q") {
      winkRef.current = { ...winkRef.current, left: !winkRef.current.left };
      onWinkChange({ ...winkRef.current });
    }
    if (e.key === "e") {
      winkRef.current = { ...winkRef.current, right: !winkRef.current.right };
      onWinkChange({ ...winkRef.current });
    }
  }, [onEmotionChange, onWinkChange]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(emotionTimerRef.current);
    };
  }, [handleKeyDown]);
}

/*
 * キーバインド一覧（UI表示用）:
 * 1 → 照れ頬染め（3秒）
 * 2 → 泣き顔（トグル）
 * 3 → 怒り（トグル）
 * 4 → サプライズ（2秒）
 * 5 → 笑顔（トグル）
 * q → 左ウィンク（トグル）
 * e → 右ウィンク（トグル）
 */
```

---

## 12. メインループ統合

```typescript
// frontend/src/hooks/useFaceTracking.ts
import { useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { mapLandmarksToParams } from "../utils/faceMapper";
import { createIdleState, updateIdle } from "../utils/idleAnimator";
import { AvatarParameters, EmotionType } from "../types/avatar";
import { AvatarRenderer } from "../utils/pixiRenderer";

export function useFaceTracking(
  renderer: AvatarRenderer | null,
  onError: (msg: string) => void,
) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef      = useRef<HTMLVideoElement | null>(null);
  const animFrameRef  = useRef<number>(0);
  const idleStateRef  = useRef(createIdleState());
  const lastFrameRef  = useRef(performance.now());
  // 感情・ウィンク状態（キーバインドから書き込まれる）
  const emotionRef    = useRef<EmotionType>("neutral");
  const winkRef       = useRef({ left: false, right: false });

  // キーバインドから呼ばれるセッター
  const setEmotion = useCallback((emotion: EmotionType) => { emotionRef.current = emotion; }, []);
  const setWink    = useCallback((w: { left: boolean; right: boolean }) => { winkRef.current = w; }, []);

  const detectLoop = useCallback(() => {
    if (!renderer) { animFrameRef.current = requestAnimationFrame(detectLoop); return; }

    const now      = performance.now();
    const deltaMs  = now - lastFrameRef.current;
    lastFrameRef.current = now;

    // ── A. 顔追跡パラメータ取得 ──
    let facialParams = mapLandmarksToParams([], []); // デフォルト（顔未検出時）
    if (landmarkerRef.current && videoRef.current?.readyState === 4) {
      try {
        const results = landmarkerRef.current.detectForVideo(videoRef.current, now);
        if (results.faceLandmarks.length > 0) {
          facialParams = mapLandmarksToParams(
            results.faceLandmarks[0],
            results.faceBlendshapes?.[0]?.categories ?? []
          );
        }
      } catch { /* 検出失敗は無視 */ }
    }

    // ── B. アイドルアニメーション更新 ──
    const { state: newIdleState, output: idle } = updateIdle(idleStateRef.current, now, deltaMs);
    idleStateRef.current = newIdleState;

    // ── C. 感情・ウィンクの合成 ──
    let finalBlinkL = facialParams.blink_left  * idle.autoBlinkValue;
    let finalBlinkR = facialParams.blink_right * idle.autoBlinkValue;
    // ウィンク（キーバインド）が発動中は対象の目を強制的に閉じる
    if (winkRef.current.left)  finalBlinkL = 0.0;
    if (winkRef.current.right) finalBlinkR = 0.0;

    // ── D. 最終パラメータ構築 ──
    const finalParams: AvatarParameters = {
      ...facialParams,
      blink_left:   finalBlinkL,
      blink_right:  finalBlinkR,
      breath_offset: idle.breathOffsetY,
      auto_blink:   1.0, // 既にblink_left/rightに反映済みなので1.0固定
      emotion:      emotionRef.current,
    };

    // ── E. レンダラー更新 ──
    renderer.updateParameters(finalParams);

    animFrameRef.current = requestAnimationFrame(detectLoop);
  }, [renderer]);

  // MediaPipe初期化
  useEffect(() => {
    const init = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        landmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,  // 瞳XY追跡に必須
        });
      } catch {
        onError("MediaPipeの初期化に失敗しました。ネットワーク接続を確認してください。");
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        onError("カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。");
      }

      animFrameRef.current = requestAnimationFrame(detectLoop);
    };

    init();
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [detectLoop, onError]);

  return { videoRef, setEmotion, setWink };
}
```

---

## 13. SAM2パーツ分割（v3.0拡張: 目3層対応）

### 13.1 ランドマーク座標変換（必須）

```python
# backend/services/sam2_service.py
def normalized_to_pixel(lm_x: float, lm_y: float, img_w: int, img_h: int) -> list[float]:
    """
    MediaPipe正規化座標(0.0〜1.0) → ピクセル座標変換
    ⚠️ この変換を省略すると SAM2 への入力点が全て左上に集中してセグメンテーションが完全に失敗する
    """
    return [lm_x * img_w, lm_y * img_h]
```

### 13.2 パーツ→ランドマーク マッピング（v3.0拡張版）

```python
# 目を3層（瞳/白目/上まぶた）に分割するためのランドマーク定義
LANDMARK_TO_PARTS = {
    # ── 顔 ──
    "face":             [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288],
    "nose":             [1, 2, 5, 4, 19, 94],
    "mouth":            [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],

    # ── 目（3層）──
    # 白目: 目全体の外縁ランドマーク
    "left_white":       [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    "right_white":      [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
    # 瞳: 瞳孔中心付近（MediaPipeのiris landmark）
    "left_pupil":       [468, 469, 470, 471, 472],   # iris landmarks（FaceLandmarkerで取得）
    "right_pupil":      [473, 474, 475, 476, 477],
    # 上まぶた: 上瞼ライン
    "left_upper_lid":   [159, 160, 161, 246, 33, 130, 7, 163],
    "right_upper_lid":  [386, 385, 384, 398, 362, 359, 382, 381],

    # ── 眉 ──
    "left_brow":        [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "right_brow":       [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],

    # ── 頬染め（顔の左右下部）──
    "blush_left":       [116, 117, 118, 119, 100, 47, 114, 188],
    "blush_right":      [345, 346, 347, 348, 329, 277, 343, 412],

    # ── 髪 ──
    "hair_back":        [10, 338, 297, 332, 284, 251],
    "hair_front":       [10, 338, 109, 67, 103, 54],
    "hair_side_left":   [234, 93, 132, 58, 172],
    "hair_side_right":  [454, 323, 361, 288, 397],
}
```

### 13.3 自動セグメンテーション処理

```python
async def auto_segment_all_parts(
    image_b64: str,
    landmarks: list,
    img_width: int,
    img_height: int,
    gpu_server_url: str,
) -> dict:
    """全パーツを自動セグメンテーション。失敗パーツはerrorを記録してスキップ。"""
    results = {}
    async with httpx.AsyncClient(timeout=60.0) as client:
        for part_name, indices in LANDMARK_TO_PARTS.items():
            # ⚠️ 必ず normalized_to_pixel() を通すこと
            points = [
                normalized_to_pixel(landmarks[i].x, landmarks[i].y, img_width, img_height)
                for i in indices if i < len(landmarks)
            ]
            if not points:
                results[part_name] = {"error": "ランドマークが不足", "mask_b64": None}
                continue

            try:
                res = await client.post(f"{gpu_server_url}/segment", json={
                    "image_b64": image_b64,
                    "points": points,
                    "labels": [1] * len(points),
                    "part_name": part_name,
                })
                res.raise_for_status()
                results[part_name] = res.json()
            except Exception as e:
                results[part_name] = {"error": str(e), "mask_b64": None}
    return results
```

---

## 14. 画像生成（SD/Geminiフォールバック）

```python
# backend/services/image_generator.py
import httpx
from google import genai
from google.genai import types
import base64
from io import BytesIO

class ImageGenerator:
    """
    画像生成抽象化レイヤー。
    SD (AUTOMATIC1111) が利用可能ならSD、失敗時は Gemini 2.5 Flash Image にフォールバック。
    """
    def __init__(self, sd_url: str, gemini_api_key: str):
        self.sd_url = sd_url
        self.gemini_api_key = gemini_api_key

    async def generate(self, prompt: str, num_images: int = 4) -> dict:
        try:
            images = await self._generate_sd(prompt, num_images)
            return {"images": images, "backend_used": "stable_diffusion"}
        except Exception as e:
            print(f"SD失敗、Geminiにフォールバック: {e}")

        try:
            images = await self._generate_gemini(prompt, num_images)
            return {"images": images, "backend_used": "gemini"}
        except Exception as e:
            raise RuntimeError(f"画像生成に失敗しました（SD・Geminiともに失敗）: {e}")

    async def _generate_sd(self, prompt: str, num_images: int) -> list[str]:
        payload = {
            "prompt": (
                "masterpiece, best quality, highly detailed, anime style, "
                "2d illustration, character design sheet, white background, "
                f"front facing, upper body, colorful hair, big eyes, cute face, {prompt}"
            ),
            "negative_prompt": (
                "lowres, bad anatomy, bad hands, text, error, missing fingers, "
                "extra digit, fewer digits, cropped, worst quality, low quality, "
                "normal quality, jpeg artifacts, signature, watermark, username, "
                "blurry, bad face, deformed face, multiple faces"
            ),
            "steps": 28, "width": 512, "height": 768,
            "cfg_scale": 7, "batch_size": num_images,
            "sampler_name": "DPM++ 2M Karras",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(f"{self.sd_url}/sdapi/v1/txt2img", json=payload)
            res.raise_for_status()
            return res.json()["images"]

    async def _generate_gemini(self, prompt: str, num_images: int) -> list[str]:
        """
        Gemini 2.5 Flash Image（通称 nano-banana）でアニメキャラを生成。
        モデルID: gemini-2.5-flash-image（安定版）
        注意: SynthID電子透かしが自動埋め込まれる。商用利用前にGoogle利用規約を確認すること。
        """
        client = genai.Client(api_key=self.gemini_api_key)
        anime_prompt = (
            f"アニメスタイルの2Dイラスト、正面向き、上半身、白背景、"
            f"VTuberアバター用キャラクターデザイン: {prompt}"
        )
        images = []
        for _ in range(num_images):
            response = client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=anime_prompt,
                config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    images.append(base64.b64encode(part.inline_data.data).decode())
        return images
```

---

## 15. Stable Diffusion WebUI セットアップ（Windows）

```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui

# webui-user.bat を編集:
# set COMMANDLINE_ARGS=--api --listen --port 7860 --xformers

# アニメ系モデルを models/Stable-diffusion/ に配置（いずれか1つ）:
# AnythingV5:     https://huggingface.co/stablediffusionapi/anything-v5
# Counterfeit-V3: https://huggingface.co/gsdf/Counterfeit-V3.0

# 起動
webui-user.bat
# ブラウザで http://localhost:7860 が開けばOK
# http://localhost:7860/docs でSwagger UI → API有効化を確認
```

---

## 16. OBS連携・出力設定

### ブラウザソース設定

```
URL:    http://localhost:5173/avatar
幅:     512
高さ:   768
FPS:    30
カスタムCSS:
  body { background-color: rgba(0, 0, 0, 0) !important; margin: 0; }
「OBSによるブラウザのアクセラレーション」: ON
「ページが非表示でもソースをアクティブにする」: ON
```

### Virtual Camera設定

OBS → 仮想カメラを起動 → ZoomやTeamsで「OBS Virtual Camera」を選択して使用可能。

---

## 17. 環境変数

```bash
# backend/.env（Gitに含めない）
GPU_SERVER_HOST=192.168.1.200
GPU_SERVER_SD_PORT=7860
GPU_SERVER_SAM2_PORT=8001
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173
GEMINI_API_KEY=your_google_ai_studio_api_key

# frontend/.env（Gitに含めない）
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

---

## 18. 開発フェーズと完了条件

### Phase 1: MVP（目標: 2〜3週間）

**事前チェック:** `runHealthCheck()` 実行 → エラー0件を確認

**実装内容:**
- [ ] FastAPI バックエンド起動（`/health` で疎通確認）
- [ ] React + Vite フロントエンド起動
- [ ] カメラ + MediaPipe 顔追跡動作確認
- [ ] `public/test-parts/` に手動で用意したPNGパーツを配置（目一体・口・眉）
- [ ] PixiJSでパーツ表示
- [ ] まばたき・口開閉・眉上下・首振り（視差スクロール）が動く
- [ ] **自動まばたき**: 顔未検出時も3〜5秒に1回まばたきする（idleAnimator実装）

**完了条件:** カメラに向かって目を閉じるとアバターも閉じる。PCから離れても自動でまばたきし続ける。

---

### Phase 2: コア自動化（目標: 1〜2ヶ月）

**事前チェック:** localhost:8001 `/health` 確認（`curl http://localhost:8001/health`）

**実装内容:**
- [ ] SD WebUI 起動・API 有効化
- [ ] ImageGenerator（SD/Geminiフォールバック）動作確認
- [ ] プロンプト → 4枚生成 → 選択UI
- [ ] SAM2自動パーツ分割（**目3層分割: 瞳/白目/上まぶた**）
- [ ] normalized_to_pixel() 変換を必ず通すこと
- [ ] 手動補正UI
- [ ] **呼吸モーション**: 常時サインカーブでY座標±3px
- [ ] **瞳XY追跡**: FaceBlendshapesから視線方向を取得
- [ ] **物理演算（髪揺れ）**: hair_* パーツにSpringChain適用
- [ ] **キーバインド表情**: 1〜5/q/e の全7種

**完了条件:** プロンプト入力から3分以内に動くアバターが完成。髪が首振りに連動して自然に揺れる。ウィンクと照れが即時発動できる。

---

### Phase 3: フル自動化（目標: 2〜3ヶ月）

**実装内容:**
- [ ] アンカーポイント・parallax・物理演算設定の完全自動推定
- [ ] 口形状差分（あいうえおリップシンク）の追加（表情の多様化）
- [ ] プロジェクト保存・読み込み（JSON形式）
- [ ] OBS Virtual Camera の安定化
- [ ] 30fps 安定動作の確認とチューニング
- [ ] キーバインドのカスタマイズUIの実装

**完了条件:** 非エンジニアでも使える完成度。30fps 安定。

---

### Phase 4: ビジネス化（オプション）

- [ ] SaaS化（クラウドデプロイ）
- [ ] VTube Studio互換フォーマットエクスポート
- [ ] 複数キャラの管理・切り替え
- [ ] ⚠️ Gemini生成画像のSynthIDに関するGoogle利用規約の確認

---

## 19. パフォーマンス目標

| 項目 | 目標値 |
|------|--------|
| 顔追跡 → パラメータ変換 | 5ms以内 |
| 物理演算（全髪パーツ） | 2ms以内 |
| PixiJS描画更新 | 16ms以内 |
| エンドツーエンドレイテンシ | 30ms以内 |
| 描画FPS | 30fps以上（60fps目標） |
| SD画像生成（4枚） | 60秒以内 |
| Geminiフォールバック（4枚） | 30秒以内 |
| SAM2セグメンテーション（全パーツ） | 30秒以内 |

---

## 20. 重要な注意事項

### 20.1 物理演算のdeltaTime管理
毎フレームの経過時間を正確に計測すること。タブが非アクティブになると requestAnimationFrame が止まり、再開時に極端に大きな deltaTime が渡されることがある。`Math.min(deltaTime, 0.05)` で必ずクランプすること。

### 20.2 目の3層描画順序
`left_white`（zIndex:500）→ `left_pupil`（zIndex:600）→ `left_upper_lid`（zIndex:700）の順で描画されること。この順番が逆になると白目が瞳の上に来て見えなくなる。

### 20.3 自動まばたきと顔追跡の合成
最終的なまばたき値は `blink_face × auto_blink` の積で計算する。顔追跡が目を開いていると判定（blink=1.0）しても自動まばたきが発動中（auto_blink=0.0）なら目は閉じる。これが正しい挙動。

### 20.4 Gemini 2.5 Flash Image の注意
- モデルID: `gemini-2.5-flash-image`（安定版）
- SynthID電子透かしが自動埋め込まれる
- アニメ特化度はSD + AnythingV5より低い（フォールバック専用）
- 商用利用前にGoogle利用規約を確認すること

### 20.5 Windows CUDA デバイス選択
```python
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"使用デバイス: {device}")
# "cpu" と表示される場合は以下を確認:
#   1. nvcc --version でCUDA 12.1.x が入っているか
#   2. pip install torch --index-url https://download.pytorch.org/whl/cu121 でインストールしたか
#   3. PCを再起動してドライバが認識されているか
```

### 20.6 CORSとセキュリティ
v3.1からバックエンド・GPUサーバーが同一Windows機のlocalhost通信になったため、CORS設定はlocalhost:5173（フロントエンド）からのアクセスのみ許可すれば十分。`allow_origins=["*"]` は開発時のみ許可し、将来のSaaS化時は制限すること。

---

## 21. トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| MediaPipeが初期化されない | CDN疎通失敗 | `curl https://cdn.jsdelivr.net` で確認。失敗ならWASMをローカルに配置 |
| まばたきが不安定 | 適応閾値がまだ収束していない | 10秒ほどカメラに顔を向けて待つ |
| 髪が「ゴムみたいに」跳ね返る | dampingが低すぎる | `damping` を 0.8以上に上げる |
| 髪が全然揺れない | stiffnessが高すぎる | `stiffness` を 0.1〜0.2に下げる |
| 瞳が動かない | `outputFaceBlendshapes: true` 未設定 | FaceLandmarkerのオプションを確認 |
| 自動まばたきが止まる | requestAnimationFrameのタブ非アクティブ | deltaTimeのクランプ（0.05s上限）が機能しているか確認 |
| 首振りで顔が歪む | skewを使っている | 視差スクロール方式（parallax係数）で各スプライトのX/Yを個別移動させること |
| SAM2のセグメントが崩れる | 正規化座標をそのまま渡している | `normalized_to_pixel()` を必ず通すこと |
| GPU Serverに接続できない | ポートが別プロセスに占有されている | `netstat -ano \| findstr :8001` でプロセス確認・終了する |
| SD生成が遅い | バッチサイズ・解像度過大 | `steps: 20`、解像度 `512×512` に下げる |
| Geminiが常に呼ばれる | SDサーバー死亡 | `curl http://[WindowsIP]:7860/health` で確認 |
| 呼吸モーションが大きすぎる | amplitudeが大きい | `BREATH_AMPLITUDE` を 1〜2 に下げる |
| キーバインドが反応しない | フォーカスがcanvas外 | `window.addEventListener("keydown")` を使っているか確認（input要素ではなくwindow） |

---

*この技術書はshiver v3.0の最終実装ガイドである。必ずフェーズ順に進め、各完了条件を確認してから次のフェーズへ進むこと。*
