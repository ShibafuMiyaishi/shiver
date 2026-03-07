# shiver 技術書 v3.0（最終版）
## AI自動生成VTuberアバターシステム

**バージョン**: 3.2.1
**最終更新**: 2026-03-07
**対象読者**: Claude Code (AIコーディングエージェント)

### 変更履歴
| バージョン | 主な変更 |
|-----------|---------|
| v1.0 | 初版 |
| v2.0 | 首振り修正・座標変換追加・適応閾値・エラーハンドリング・Geminiフォールバック |
| v3.0 | 物理演算（髪揺れ）・呼吸モーション・自動まばたき・瞳XY追跡・キーバインド表情・目3層分割を追加 |
| v3.1 | 開発環境をWindows + VS Codeに変更。開発・GPU推論をWindows 1台に統合 |
| v3.2 | **画像生成アーキテクチャを刷新。「1枚絵生成→SAM2切り抜き」から「ベース生成→マスクインペイントでパーツ個別生成」方式に変更。実験フェーズはGemini 2.5 Flash Image、検証後にGemini 3 Pro Imageへアップグレード** |
| v3.2.1 | **Gemini API最適化。順次生成・retryDelay解析・リトライ削減(5→2回)・semaphore制限(4→2)・response_modalities修正・Client使い回し・ログUTF-8化** |

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

### 1.2 ビジョン（最終目標）
> テキストプロンプト1つ入力するだけで、リアルタイムで「生きているように見える」オリジナルVTuberアバターが自動生成されるシステム

### 1.2.1 現段階の正直な位置づけ（Phase 1〜2）

**現在のフローは「半自動制作ツール」である。フルオートではない。**

```
実際のフロー:
  ① テキストプロンプト入力
  ② Gemini（優先）/ SD WebUI でベース画像を4枚生成
  ③ ユーザーが1枚を選択          ← 人間の判断が必要
  ④ SAM2 でマスク生成
  ⑤ Gemini でパーツ個別生成（約75秒）
  ⑥ 手動補正UI でパーツを確認・修正  ← 人間の操作が必要
  ⑦ リアルタイムアバターとして動作

所要時間（目安）:
  自動処理: ①〜⑤ 約165秒（3分弱）
  人間操作: ③+⑥ 状況によるが合計5〜10分
  合計:     10分前後

比較:
  従来のVTuberモデル制作: 150,000〜450,000円 + 2〜6ヶ月
  shiver（現段階）:        10〜15分 + API費用約350円

Phase 3 以降でフルオート化（ユーザー選択・手動補正を最小化）を目指す。
```

### 1.3 「生きてる感」の定義
shiverが目指すアバターは単に「顔追跡で動く」だけでなく、以下すべてを満たすこと。

| 要素 | 説明 | 実装 |
|------|------|------|
| 自動まばたき | 顔未検出時も3〜5秒に1回まばたきする | Phase 1 |
| 呼吸モーション | 静止中も全体ボビング（全パーツが微妙に上下する。体パーツが存在しないため全体ボビングで呼吸感を表現する仕様） | Phase 2 |
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

# ⚠️ SAM2 Windowsネイティブ インストールに関する重要注記 ⚠️
# SAM2の公式リポジトリはWindows環境について WSL（Windows Subsystem for Linux）+ Ubuntu を
# 強く推奨している。Windowsネイティブでも動く可能性はあるが、以下のリスクがある:
#   - CUDA拡張のビルドでエラーになりやすい
#   - 依存ライブラリのバージョン競合が発生しやすい
#   - 公式のサポート対象外
#
# 【推奨】SAM2をWSL上で動かす場合:
#   1. Windows 11でWSLを有効化: wsl --install
#   2. Ubuntu 22.04をインストール: wsl --install -d Ubuntu-22.04
#   3. WSL内でSAM2をインストール（Linuxの手順に従う）
#   4. WSL内でSAM2サーバーを起動し、WindowsのバックエンドからHTTPで呼び出す
#      WSLのIPアドレスは: wsl hostname -I で確認（通常 172.x.x.x）
#
# 【現状のWindowsネイティブ手順（動かない場合はWSLに切り替えること）】

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
set COMMANDLINE_ARGS=--api --port 7860 --xformers
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
│   │   ├── base_image_generator.py      # STAGE 1: Gemini優先/SDフォールバック
│   │   ├── parts_generator.py           # STAGE 2: パーツ個別生成（依存グラフ）
│   │   └── sam2_service.py              # SAM2マスク生成・座標変換
│   └── models/schemas.py
└── gpu-server/
    ├── requirements.txt
    └── server.py                        # SAM2推論サーバー（/health, /segment）
```

---

## 3. システムアーキテクチャ

### 3.0 ⚠️ 設計の根本を理解する：「分解方式」vs「積み上げ方式」

#### VTuber制作の正しいイメージ（従来Live2D方式）

従来のVTuber制作（Live2D等）では、各パーツは**最初から個別に描かれる**。

```
① 絵師がパーツを個別レイヤーで描く（Photoshop / ClipStudio等）
   └ hair_back（後ろ髪・全体）
   └ face（顔の肌・耳・首、目や眉の「下に隠れる部分」も含めて完全に描く）
   └ left_white（白目。まぶたに隠れる部分も含めて楕円形で描く）
   └ left_upper_lid（上まぶた）
   └ left_pupil（瞳）
   └ left_brow（眉）
   └ mouth（口。舌・歯も別レイヤーで描く）
   └ blush（頬染め。半透明PNG）
   └ hair_front（前髪。顔に被る部分も全部描く）
   ※「隠れている部分」もちゃんと描く。重なり合って完成する。

② PSDファイルのまま Live2D に読み込み
③ 各パーツにメッシュ変形・リギングを設定
④ 顔追跡ソフト（VTube Studio等）と接続して動かす
```

#### shiver の方式（自動分解方式）とその限界

shiverは「1枚の完成イラストをAIで生成してから、SAM2で切り抜いてパーツに分解する」方式をとる。

```
① SD/Geminiで完成した1枚絵を生成（全パーツが合成済みの状態）
② SAM2で各パーツ領域を検出・切り抜く
③ 切り抜いたPNGをPixiJSで重ね合わせて動かす
```

**この方式には「オクルージョン問題」がある:**

```
❌ 問題①「切り抜くと穴が空く」
   完成絵で前髪(hair_front)を切り抜くと、face.png の額部分に穴が空く。
   なぜなら完成絵の「前髪の下の肌」ピクセルは存在しないから。
   → まばたきで上まぶたが動くと、その下に「黒い穴」が見える

❌ 問題②「髪が揺れると背景が透ける」
   首振りで hair_side_left がずれると、その下の「耳・顔側面のピクセル」がない。
   → 物理演算で髪が揺れるほど、端っこで背景が透けて見える

❌ 問題③「目を大きく開けると不自然」
   まばたきで上まぶたが上にスケールすると、その下の白目が足りない。
   Live2Dなら白目は独立した楕円形のレイヤーが存在するが、
   shiver では切り抜いた白目しかないため目を大きく開けると不自然になる
```

**この問題は Phase 1 では「動きの範囲を小さく抑える」ことで誤魔化せるが、クオリティの上限を根本的に制限する。**

---

#### shiver の2モード設計（v3.1から導入）

この限界を踏まえて、shiverは2つの動作モードを持つ設計にする。

```
┌────────────────────────────────────────────────────────────────┐
│  モード① フルオート生成モード（初心者向け・手軽さ優先）         │
│                                                                  │
│  テキストプロンプト ──→ SD/Gemini で1枚絵生成                   │
│  （+ 参照画像オプション）  ↓                                    │
│                       SAM2自動分割 + インペイント補完           │
│                           ↓                                     │
│                       リギング → 動作                          │
│                                                                  │
│  ✅ プロンプトだけで動くアバターが5分で完成                     │
│  ⚠️  動きの範囲が限られる（オクルージョン問題あり）             │
│  ⚠️  参照画像でスタイル・キャラを指定可能（後述）              │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  モード② パーツアップロードモード（上級者向け・クオリティ優先） │
│                                                                  │
│  ユーザーが各パーツPNGを個別にアップロード                       │
│  （自分で描いたイラストのレイヤーをPNG書き出ししたもの）        │
│      ↓                                                          │
│  shiverはリギング・顔追跡・物理演算だけを担当                  │
│  SAM2は使わない                                                 │
│                                                                  │
│  ✅  オクルージョン問題ゼロ（最初からパーツ分けされているため）  │
│  ✅  Live2D品質のVTuberが作れる                                 │
│  ✅  自分で描いたキャラクターをそのまま使える                   │
│  ⚠️  ユーザーが事前にパーツ分けPNGを用意する必要がある         │
└────────────────────────────────────────────────────────────────┘
```

**モード②のパーツ分け規則（ユーザーへのガイドライン）:**

```
ユーザーが用意すべきPNGファイル一覧（全て背景透過）:
  hair_back.png    ─ 後ろ髪・全体形状を描く（顔に隠れる部分も含める）
  face.png         ─ 顔の肌・耳・首（目・眉・口の「穴」は塗りつぶした状態で描く）
  left_white.png   ─ 左白目（楕円形・まぶたに隠れる部分も含めて描く）
  right_white.png  ─ 右白目
  left_pupil.png   ─ 左瞳（虹彩・瞳孔）
  right_pupil.png  ─ 右瞳
  left_upper_lid.png  ─ 左上まぶた
  right_upper_lid.png ─ 右上まぶた
  left_brow.png    ─ 左眉
  right_brow.png   ─ 右眉
  nose.png         ─ 鼻
  mouth.png        ─ 口（閉じた状態）
  blush_left.png   ─ 左頬染め（半透明グラデーション推奨）
  blush_right.png  ─ 右頬染め
  hair_front.png   ─ 前髪（顔に被る部分も全部描く）
  hair_side_left.png  ─ 左サイド髪
  hair_side_right.png ─ 右サイド髪

合計: 17ファイル
推奨解像度: 512×768px（アバターキャンバスと同サイズ）
フォーマット: PNG（背景透過・アルファチャンネルあり）
```

---

#### 画像入力（参照画像）対応

テキストプロンプトに加え、**参照画像を渡してキャラを生成**できる機能をモード①に追加する。3つの方式を実装する。

```
方式①: SD img2img
  概要: 参照画像を元に「似た構図・スタイル」でリドロー
  使い方: 「このラフ絵をアニメ塗りにして」
  パラメータ: denoising_strength（0=元画像そのまま, 1=完全再生成）
  推奨値: 0.55〜0.75（元のキャラを保ちつつアニメ化）

方式②: SD ControlNet（最もパワフル）
  - Reference モード: 参照画像のスタイル・絵柄を強く反映
  - Canny モード: 参照画像の輪郭線を保って再生成
  使い方: 「自分で描いたキャラのラフ絵を渡して、SDの画風で清書させる」
  ※ ControlNet は SD WebUI に拡張機能として追加が必要（後述）

方式③: Gemini 画像入力
  概要: Gemini 2.5 Flash Imageは画像を入力として受け付ける
  使い方: 画像 + 「このキャラをアニメVTuberスタイルで描いて」
  メリット: APIレベルで対応・実装が最も簡単
```

**参照画像をUIから渡せるようにする（フルオート生成モードの拡張）:**

```
[プロンプト入力画面 - v3.1拡張]
  ┌─────────────────────────────────────┐
  │ テキストプロンプト:                   │
  │ [青い長髪の魔法使い少女          ]   │
  │                                       │
  │ 参照画像（任意）:                    │
  │ [ファイルをドロップ or クリック]      │
  │  ← ここに画像を入れると              │
  │     そのスタイル・キャラで生成       │
  │                                       │
  │ 生成方式:                            │
  │ ○ テキストのみ（SD txt2img）        │
  │ ○ 参照画像+テキスト（img2img）     │
  │ ○ 参照画像+ControlNet              │
  │                                       │
  │ [生成する]                            │
  └─────────────────────────────────────┘
```

---

### 3.1 全体パイプライン

```
[PHASE 1: ベース画像生成]
プロンプト入力（+ 参照画像オプション）
  → BaseImageGenerator
  → 🥇 Gemini 2.5 Flash Image（優先・高品質）
  → 🥈 SD WebUI + Illustrious XL v2.0（Geminiが使えない場合のフォールバック）
  → 4枚生成 → ユーザーが1枚選択
  ↓
  ※ このベース画像は「リファレンス画像」として以降の全ステップで参照される

[PHASE 2: マスク生成]
選択画像 → MediaPipe Face Mesh（正規化座標取得）
→ normalized_to_pixel() 変換（必須）
→ SAM2セグメンテーション（GPU Server）
→ 各パーツのマスクPNG（白=対象領域・黒=保持領域）を生成

  生成マスク一覧（17パーツ）:
    顔: face / nose / mouth
    目（3層）: left_pupil / left_white / left_upper_lid
               right_pupil / right_white / right_upper_lid
    眉: left_brow / right_brow
    頬: blush_left / blush_right
    髪: hair_back / hair_front / hair_side_left / hair_side_right

[PHASE 3: パーツ個別生成（v3.2 コア処理）]
各パーツを以下の手順で個別生成する:

  入力:
    - ベース画像（リファレンス）
    - 対象パーツのマスクPNG
    - パーツ別プロンプト（例: "前髪パーツ、背景透過PNG、前髪の下に隠れた額の肌も自然に補完"）

  実験フェーズ（現在）:
    🧪 Gemini 2.5 Flash Image（マルチターン会話でベース画像を参照しながら生成）
    → コスト約$0.039/枚 × 17パーツ ≒ $0.66/キャラ（約100円）

  本番フェーズ（システム検証後にアップグレード）:
    🚀 Gemini 3 Pro Image（14参照画像入力・推論による隠れ部分補完）
    → コスト約$0.134/枚 × 17パーツ ≒ $2.28/キャラ（約350円）

  出力: 各パーツの背景透過PNG（17枚）
  ※ 処理は並列化して高速化（後述）

[PHASE 4: 手動補正UI]
生成された17パーツPNGを画面上に表示
ユーザーが不自然な部分をブラシツールで修正
→ 確定後、各パーツPNG保存

[PHASE 5: リギング]
各パーツ → PixiJS Sprite配置（zIndex・parallax・anchorPoint設定）
物理演算設定: hair_* パーツに SpringChain を自動アタッチ

[PHASE 6: リアルタイム処理（毎フレーム実行）]

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

[PHASE 7: 出力]
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
opencv-python>=4.8.0   # chroma_key_to_rgba() のグリーンバック除去に必須

# オプション（推奨）: グリーンバック未検出時のフォールバック背景除去
# pip install rembg
# ※ 初回実行時に ~200MB のU2Netモデルを自動ダウンロード
# ※ rembg が未インストールでも動作するが、グリーンバック以外の背景が来た場合に
#    手動補正UIへの転送となる
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
// 正しいcategoryName: eyeLookInLeft / eyeLookOutLeft / eyeLookUpLeft / eyeLookDownLeft
// ※ eyeLookIn_L 等のアンダースコア形式は間違い（categoryNameが一致しない）
// =========================================
function calcPupilXY(blendshapes: Category[]): { x: number; y: number } {
  const get = (name: string) => blendshapes.find(b => b.categoryName === name)?.score ?? 0;

  const lookLeft  = get("eyeLookOutLeft");   // 左目が左を向く
  const lookRight = get("eyeLookInLeft");    // 左目が右を向く
  const lookUp    = get("eyeLookUpLeft");
  const lookDown  = get("eyeLookDownLeft");

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
  if (landmarks.length < 478) {
    // MediaPipe FaceLandmarker は 478点出力（478未満の場合は顔未検出またはiris未取得）
    // 468〜477: iris landmarks（瞳追跡に必要）
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

    // ──── 視差スクロール（首振り）＋ 全体ボビング（呼吸effect） ────
    // ⚠️ skewは使わない。必ず各パーツのX/Y座標をparallax係数で個別移動させること
    // ⚠️ 瞳・眉は上記で個別にX/Yを設定済みのため、このループから除外する
    //    （除外しないと pupil_x/y・brow_y が parallax 値で上書きされてしまう）
    const PUPIL_BROW_PARTS = new Set([
      "left_pupil", "right_pupil", "left_brow", "right_brow"
    ]);

    const YAW_SCALE   = 2.5;
    const PITCH_SCALE = 1.5;
    const ROLL_SCALE  = 1.0;

    this.sprites.forEach((sprite, partId) => {
      const part = this.parts.get(partId);
      if (!part) return;

      // 瞳・眉は個別処理済みのためスキップ
      if (PUPIL_BROW_PARTS.has(partId)) return;

      // 首振り（視差）
      const dx = params.head_yaw   * part.parallax * YAW_SCALE;
      const dy = params.head_pitch * part.parallax * PITCH_SCALE;
      // 首傾げ（ロール）: 顔中心を軸にX方向のオフセット
      const rollDx = params.head_roll * (sprite.baseY - 384) * 0.005 * part.parallax * ROLL_SCALE;

      // 全体ボビング（呼吸effect: 全パーツが微妙に上下する。体パーツは存在しないためこの実装が呼吸表現）
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

### 13.0 SAM2のアニメドメインギャップ対策【論文知見】

```
See-through論文の指摘:
  SAM2は実写画像に最適化されており、アニメ絵に対してドメインギャップがある。
  特に「アニメ特有の大きな髪の毛の房」「輪郭線が太い部分」でマスクが
  途切れたり、パーツが不完全になることがある。

対策: Point + BBox（バウンディングボックス）の組み合わせ
  Points のみ渡す: 「この点の周辺」として局所的に解釈 → 髪先が切れやすい
  BBox + Points : 「この矩形内でこの点を含む領域」として解釈 → 精度が格段に向上

BBoxの計算コスト: ランドマーク座標の min/max を取るだけ（処理時間 <1ms）
```

### 13.1 ランドマーク座標変換（必須）

```python
# backend/services/sam2_service.py
def normalized_to_pixel(lm_x: float, lm_y: float, img_w: int, img_h: int) -> list[float]:
    """
    MediaPipe正規化座標(0.0〜1.0) → ピクセル座標変換
    ⚠️ この変換を省略すると SAM2 への入力点が全て左上に集中してセグメンテーションが完全に失敗する
    """
    return [lm_x * img_w, lm_y * img_h]


def compute_bbox_from_landmarks(
    landmarks: list,
    indices: list[int],
    img_w: int,
    img_h: int,
    padding_ratio: float = 0.15,
) -> list[float] | None:
    """
    指定ランドマーク群からバウンディングボックスを計算する。
    SAM2に Point と一緒に渡すことでアニメ絵のマスク精度を向上させる。

    Args:
        padding_ratio: BBoxを何割広げるか（髪の毛の先端まで含めるため推奨0.15〜0.25）

    Returns:
        [x_min, y_min, x_max, y_max] or None（ランドマーク不足時）
    """
    valid_points = [
        normalized_to_pixel(landmarks[i].x, landmarks[i].y, img_w, img_h)
        for i in indices if i < len(landmarks)
    ]
    if not valid_points:
        return None

    xs = [p[0] for p in valid_points]
    ys = [p[1] for p in valid_points]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    # パディング追加（髪の先端・眉毛の端など輪郭外に広がるパーツのため）
    pad_x = (x_max - x_min) * padding_ratio
    pad_y = (y_max - y_min) * padding_ratio
    x_min = max(0, x_min - pad_x)
    y_min = max(0, y_min - pad_y)
    x_max = min(img_w, x_max + pad_x)
    y_max = min(img_h, y_max + pad_y)

    return [x_min, y_min, x_max, y_max]
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

### 13.3 自動セグメンテーション処理（BBox対応版）

```python
async def auto_segment_all_parts(
    image_b64: str,
    landmarks: list,
    img_width: int,
    img_height: int,
    gpu_server_url: str,
) -> dict:
    """
    全パーツを自動セグメンテーション。
    v3.2改善: PointsだけでなくBBox（バウンディングボックス）もSAM2に渡す。
    アニメ絵のドメインギャップ対策として精度が格段に向上する。
    """
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

            # v3.2追加: BBox計算（アニメ精度向上のため）
            # 髪パーツは特に広めにパディングを取る（先端が切れやすい）
            is_hair_part = part_name.startswith("hair_")
            padding = 0.25 if is_hair_part else 0.15
            bbox = compute_bbox_from_landmarks(
                landmarks, indices, img_width, img_height, padding_ratio=padding
            )

            try:
                res = await client.post(f"{gpu_server_url}/segment", json={
                    "image_b64": image_b64,
                    "points": points,
                    "labels": [1] * len(points),
                    "bbox": bbox,          # ← v3.2追加: BBoxを渡す（Noneなら無視）
                    "part_name": part_name,
                })
                res.raise_for_status()
                results[part_name] = res.json()
            except Exception as e:
                results[part_name] = {"error": str(e), "mask_b64": None}
    return results
```

---

## 14. 画像生成システム（v3.2 新アーキテクチャ）

### 14.0 設計思想とモデル選定ロードマップ

```
【v3.2 画像生成の2段階構成】

STAGE 1: ベース画像生成（品質優先）
  🥇 Gemini 2.5 Flash Image（優先・高品質）
     → LLMベースの画像生成で高品質なアニメキャラを生成。
  🥈 SD WebUI + Illustrious XL v2.0（Geminiが使えない場合のフォールバック）
     → ローカルGPU推論。VRAM 8GB向け設定（640×960, Euler a, CFG 6）

STAGE 2: パーツ個別生成（マスクインペイント・キャラ一貫性優先）
  🧪 実験フェーズ（現在）: Gemini 2.5 Flash Image
     モデルID: gemini-2.5-flash-image
     料金: $0.039/枚 × 17パーツ ≒ $0.66/キャラ（約100円）
     目的: パイプライン全体の動作検証・品質評価

  🚀 本番フェーズ（実験成功後にアップグレード）: Gemini 3 Pro Image
     モデルID: gemini-3-pro-image-preview
     料金: $0.134/枚 × 17パーツ ≒ $2.28/キャラ（約350円）
     強化点: 14参照画像入力・推論による隠れ部分補完・4K対応

【アップグレード判断基準】
  実験フェーズで以下が確認できたら本番フェーズへ移行:
  □ 17パーツが全て生成されること
  □ ベース画像のキャラクターの外見が各パーツで維持されること
  □ 前髪の下の額・目の周囲など隠れ部分の補完が自然であること
  □ 全パーツを重ね合わせたときに違和感がないこと

【なぜGemini 2.5 Flash Imageで実験するのか】
  - 同じAPIインターフェース（google-genai SDK）のため実装変更不要
  - モデルIDを1行変えるだけで3 Proに移行できる
  - コストが約1/3のためトライ&エラーが気軽にできる
  - 実験で品質が不十分なら3 Proで解決できるという"逃げ道"がある
```

---

### 14.1 ベース画像生成（STAGE 1）

```python
# backend/services/base_image_generator.py
"""STAGE 1: ベース画像生成"""
import asyncio
import base64
import logging
import random
import re
import sys

import httpx
from google import genai
from google.genai import types

logger = logging.getLogger("shiver.BaseImageGenerator")


def _parse_retry_delay(error_str: str) -> float:
    """429エラーからAPIが指定するretryDelayを抽出する"""
    match = re.search(r"retry.*?(\d+\.?\d*)s", error_str)
    if match:
        return float(match.group(1))
    return 15.0


class BaseImageGenerator:
    """Gemini優先、SD WebUIフォールバック"""

    # Illustrious XL v2.0 (SDXL) 用設定 — VRAM 8GB向け解像度
    SD_DEFAULT_PARAMS = {
        "steps": 25, "width": 640, "height": 960,
        "cfg_scale": 6, "sampler_name": "Euler a",
    }

    def __init__(self, sd_url: str, gemini_api_key: str) -> None:
        self.sd_url = sd_url
        self.gemini_api_key = gemini_api_key
        # ⚠️ genai.Clientは1回だけ作成して使い回す（毎回生成しない）
        if gemini_api_key and gemini_api_key != "your_google_ai_studio_api_key_here":
            self._gemini_client = genai.Client(api_key=gemini_api_key)
            self._gemini_async = self._gemini_client.aio
        else:
            self._gemini_client = None
            self._gemini_async = None

    async def generate(self, prompt: str, num_images: int = 4) -> dict:
        if self._gemini_async:
            try:
                images = await self._generate_gemini(prompt, num_images)
                if images:
                    return {"images": images, "backend_used": "gemini"}
            except Exception as e:
                logger.error(f"Gemini失敗 → SDにフォールバック: {e}")
        # SDフォールバック
        images = await self._generate_sd(prompt, num_images)
        return {"images": images, "backend_used": "stable_diffusion"}

    async def _generate_gemini(self, prompt: str, num_images: int) -> list[str]:
        anime_prompt = f"Create a high-quality anime-style 2D illustration. ... {prompt}"
        # ⚠️ 順次生成（並列はレート制限に引っかかる）
        images: list[str] = []
        for i in range(num_images):
            if i > 0:
                delay = 4.0 + random.uniform(0, 2)
                await asyncio.sleep(delay)
            img = await self._single_gemini_generate(anime_prompt, i + 1)
            if img:
                images.append(img)
        return images

    async def _single_gemini_generate(self, prompt: str, image_num: int = 1) -> str | None:
        """1枚のGemini画像生成。リトライは最大1回（合計2回試行）"""
        for attempt in range(2):
            try:
                response = await self._gemini_async.models.generate_content(
                    model="gemini-2.5-flash-image",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"]  # ⚠️ 公式推奨
                    ),
                )
                for part in response.candidates[0].content.parts:
                    if part.inline_data is not None:
                        return base64.b64encode(part.inline_data.data).decode()
                return None
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "rate" in error_str or "quota" in error_str:
                    if attempt >= 1:
                        return None
                    # ⚠️ APIが指定するretryDelayを尊重する
                    wait = _parse_retry_delay(error_str) + random.uniform(1, 3)
                    await asyncio.sleep(wait)
                    continue
                return None
        return None
```

**重要な設計判断（v3.2.1 API最適化）:**
- `genai.Client`は`__init__`で1回だけ作成。毎リクエスト生成はコネクション浪費
- 順次生成（4〜6秒間隔）。並列4リクエストは429レート制限の嵐を引き起こす
- リトライは最大1回（合計2試行）。5回リトライは無料枠を一瞬で消費する
- `response_modalities=["TEXT", "IMAGE"]`。`["IMAGE"]`単独は公式非推奨
- 429エラーからretryDelayを正規表現で抽出し、APIが指示する待機時間を尊重する

---

### 14.2 パーツ個別生成（STAGE 2）— マスクインペイント方式

```python
# backend/services/parts_generator.py
"""
STAGE 2: パーツ個別生成（v3.2 コア）

Fumiyaの発想:
  「基本となるキャラ画像を先に作り、その画像に従って
   前髪の右側・前髪の左側・右目・左目... と各パーツを個別に生成する」

実装:
  ベース画像 + SAM2が生成したマスク + パーツ別プロンプト
  → Gemini Flash Image（実験） / Gemini 3 Pro Image（本番）のインペイントで
    各パーツを背景透過PNGとして個別生成
  → 隠れていた部分（前髪の下の額など）もAIが自然に補完

参照論文:
  See-through: Single-image Layer Decomposition for Anime Characters
  arXiv: 2602.03749（2026年2月）
  → 同一アプローチで19パーツ分割を実現。実用性をプロが評価済み。
"""
import asyncio
import base64
import random
from io import BytesIO
from PIL import Image
import numpy as np
from google import genai
from google.genai import types


# ============================================================
# モデル設定（実験 → 本番の切り替えはここだけ変更）
# ============================================================
EXPERIMENT_MODEL = "gemini-2.5-flash-image"       # 🧪 実験フェーズ
PRODUCTION_MODEL  = "gemini-3-pro-image-preview"  # 🚀 本番フェーズ（正しいモデルID）
# ⚠️ "gemini-3-pro-image-preview" は存在しない。画像生成は "gemini-3-pro-image-preview"

# 現在使用するモデル（実験が成功したらPRODUCTION_MODELに変更）
CURRENT_MODEL = EXPERIMENT_MODEL
# ============================================================


# ============================================================
# ② RGBA透過フォールバック（論文の知見: 汎用APIは透過が苦手）
# ============================================================
def chroma_key_to_rgba(image_b64: str, part_name: str) -> str:
    """
    グリーンバック（#00FF00）画像をRGBA透過PNGに変換する。

    設計方針（v3.2確定ルール）:
      プロンプトで「背景は純粋なグリーン（#00FF00）」を必ず指定する。
      白背景を使ってはいけない理由:
        - left_white / right_white（白目）が白なので白背景と区別できず消える
        - 白髪キャラは hair_* が全消えする
      グリーンバックを選ぶ理由:
        - アニメキャラに純粋な #00FF00 はほぼ存在しない
        - HSV色空間でグリーン範囲を絞ることで高精度に抜ける

    処理フロー:
      1. 既にRGBAで透過情報あり → そのまま返す（念のため）
      2. グリーンバック検出 → HSVマスクで高精度クロマキー除去（メインパス）
      3. グリーン検出できない → rembg でAI背景除去（フォールバック）
      4. 全て失敗 → 元画像を返して手動補正UIに委ねる
    """
    import cv2
    img_bytes = base64.b64decode(image_b64)
    img = Image.open(BytesIO(img_bytes))

    # ケース1: 既にRGBAで透過ピクセルが存在する
    if img.mode == "RGBA":
        arr = np.array(img)
        if arr[:, :, 3].min() < 255:
            print(f"[chroma_key] {part_name}: 既にRGBA透過 → そのまま使用")
            return image_b64

    # ケース2: グリーンバック → HSVクロマキーで高精度除去（メインパス）
    img_rgb = img.convert("RGB")
    arr_bgr = cv2.cvtColor(np.array(img_rgb), cv2.COLOR_RGB2BGR)
    arr_hsv = cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2HSV)

    # グリーン（#00FF00）のHSV範囲
    # H: 50〜80（黄緑〜緑）, S: 180〜255（高彩度）, V: 180〜255（明るい）
    lower_green = np.array([50, 180, 180])
    upper_green = np.array([80, 255, 255])
    green_mask = cv2.inRange(arr_hsv, lower_green, upper_green)

    green_ratio = green_mask.mean() / 255
    if green_ratio > 0.1:  # 10%以上がグリーン → グリーンバック確定
        # マスクを反転（グリーン=透明、その他=不透明）
        alpha = cv2.bitwise_not(green_mask)
        # 境界のアンチエイリアス（ぼかし）
        alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
        arr_rgba = cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2BGRA)
        arr_rgba[:, :, 3] = alpha
        result = Image.fromarray(cv2.cvtColor(arr_rgba, cv2.COLOR_BGRA2RGBA))
        buf = BytesIO()
        result.save(buf, format="PNG")
        print(f"[chroma_key] {part_name}: グリーンバック → クロマキー除去 ✅（緑比率: {green_ratio:.1%}）")
        return base64.b64encode(buf.getvalue()).decode()

    # ケース3: グリーン未検出（プロンプト指示が守られなかった場合）→ rembg
    print(f"[chroma_key] {part_name}: ⚠️ グリーン未検出（緑比率: {green_ratio:.1%}）→ rembg にフォールバック")
    try:
        from rembg import remove
        img_rgba = remove(img.convert("RGBA"))
        buf = BytesIO()
        img_rgba.save(buf, format="PNG")
        print(f"[chroma_key] {part_name}: rembg で背景除去 ✅")
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        print(f"[chroma_key] {part_name}: rembg未インストール → pip install rembg")
    except Exception as e:
        print(f"[chroma_key] {part_name}: rembg失敗: {e}")

    # ケース4: 全処理失敗 → 手動補正UIに委ねる
    print(f"[chroma_key] {part_name}: ❌ 透過化失敗。手動補正UIで対応してください")
    buf = BytesIO()
    img.convert("RGBA").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# 後方互換のエイリアス（既存コードからの参照用）
ensure_rgba = chroma_key_to_rgba


# ============================================================
# レート制限対応リトライ（retryDelay解析付き）
# ============================================================
def _parse_retry_delay(error_str: str) -> float:
    """429エラーからAPIが指定するretryDelayを抽出する"""
    match = re.search(r"retry.*?(\d+\.?\d*)s", error_str)
    return float(match.group(1)) if match else 15.0

async def call_with_retry(coro_fn, max_retries: int = 2, base_delay: float = 5.0):
    """429エラー時にretryDelayを尊重してリトライ（最大2回=合計3試行）"""
    for attempt in range(max_retries + 1):
        try:
            return await coro_fn()
        except Exception as e:
            error_str = str(e).lower()
            is_rate_limit = "429" in error_str or "rate" in error_str or "quota" in error_str
            if not is_rate_limit or attempt == max_retries:
                raise
            # APIが指定するretryDelayを優先、なければExponential Backoff
            api_delay = _parse_retry_delay(error_str)
            wait_sec = max(api_delay, base_delay * (2 ** attempt)) + random.uniform(1, 3)
            logger.warning(f"レート制限 429 → {wait_sec:.0f}秒待機後リトライ ({attempt + 1}/{max_retries})")
            await asyncio.sleep(wait_sec)
    raise RuntimeError("最大リトライ回数に達しました")
# ============================================================


# パーツごとの生成プロンプト定義
#
# ルール: 「背景は純粋なグリーン（#00FF00）」を必ず明示する。
#
# ⚠️ 白背景を使ってはいけない理由:
#   left_white / right_white（白目）は白い。
#   白背景 + 白目 → chroma_key_to_rgba() が白目ごと透過にしてしまう（致命的バグ）
#   白髪キャラも同様に hair_* が全消えする。
#
# グリーンバック（#00FF00）を選ぶ理由:
#   アニメキャラには純粋なグリーン（R=0, G=255, B=0）はほぼ存在しない。
#   OpenCVのHSV色空間でグリーン範囲を絞ることで高精度に抜ける。
#   白背景より遥かに安定した透過処理が可能。
PART_PROMPTS: dict[str, str] = {
    "hair_back":        "後ろ髪パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。前髪や顔に隠れている部分も含め後ろ髪全体を自然に補完して。",
    "face":             "顔・肌パーツのみを描いてください（目・眉・口の穴は肌色で塗りつぶした状態）。背景は純粋なグリーン（#00FF00）。前髪に隠れた額・耳も含め顔全体を補完して。",
    "left_white":       "左目の白目パーツのみを描いてください（楕円形・まぶたに隠れる部分も含めて完全な形で）。背景は純粋なグリーン（#00FF00）。",
    "right_white":      "右目の白目パーツのみを描いてください（楕円形・まぶたに隠れる部分も含めて完全な形で）。背景は純粋なグリーン（#00FF00）。",
    "left_pupil":       "左目の瞳（虹彩・瞳孔）パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "right_pupil":      "右目の瞳（虹彩・瞳孔）パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "left_upper_lid":   "左目の上まぶたパーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "right_upper_lid":  "右目の上まぶたパーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "left_brow":        "左眉パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "right_brow":       "右眉パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "nose":             "鼻パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "mouth":            "口（閉じた状態）パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。",
    "blush_left":       "左頬染めパーツのみを描いてください（半透明グラデーション）。背景は純粋なグリーン（#00FF00）。",
    "blush_right":      "右頬染めパーツのみを描いてください（半透明グラデーション）。背景は純粋なグリーン（#00FF00）。",
    "hair_front":       "前髪パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。前髪の下に隠れていた額の肌も自然に補完して。",
    "hair_side_left":   "左サイド髪パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。横顔に隠れる部分も含めて補完して。",
    "hair_side_right":  "右サイド髪パーツのみを描いてください。背景は純粋なグリーン（#00FF00）。横顔に隠れる部分も含めて補完して。",
}


class PartsGenerator:
    """
    パーツ個別生成クラス。（v3.2 論文知見対応版）

    改善点:
      ① 依存グラフに基づくレイヤー順次生成（論文の "Body Part Consistency" 対応）
         完全並列ではなく、先に生成したパーツをリファレンスとして後続パーツに渡す。
      ② RGBA透過フォールバック（rembg）
         Geminiが白背景RGB画像を返した場合に自動でアルファ抽出する。
    """

    def __init__(self, gemini_api_key: str):
        # ⚠️ genai.Clientは1回だけ作成して使い回す
        self.client = genai.Client(api_key=gemini_api_key)
        self.async_client = self.client.aio  # .aio = async client
        self.model = CURRENT_MODEL
        logger.info(f"使用モデル: {self.model}")

    # ============================================================
    # ① 依存グラフ定義（See-through論文の知見を応用）
    # 「先に生成したパーツを後続パーツのリファレンスに渡す」ことで
    # パーツ間の補完領域の矛盾（奪い合い・穴）を防ぐ。
    # ============================================================
    # 各レイヤーは前のレイヤーが全て完了してから並列実行される。
    # depends_on: このパーツを生成する際、リファレンスとして追加で渡す生成済みパーツ名
    GENERATION_LAYERS = [
        # LAYER 0: 完全独立。リファレンス不要。
        {
            "hair_back":      {"depends_on": []},
            "blush_left":     {"depends_on": []},
            "blush_right":    {"depends_on": []},
        },
        # LAYER 1: hair_backが確定した後で生成。
        {
            "face":           {"depends_on": ["hair_back"]},
        },
        # LAYER 2: faceが確定した後で並列生成。
        {
            "left_white":     {"depends_on": ["face"]},
            "right_white":    {"depends_on": ["face"]},
            "nose":           {"depends_on": ["face"]},
            "mouth":          {"depends_on": ["face"]},
            "left_brow":      {"depends_on": ["face"]},
            "right_brow":     {"depends_on": ["face"]},
        },
        # LAYER 3: left_white / right_whiteが確定した後で並列生成。
        {
            "left_pupil":     {"depends_on": ["left_white"]},
            "right_pupil":    {"depends_on": ["right_white"]},
            "left_upper_lid": {"depends_on": ["left_white"]},
            "right_upper_lid":{"depends_on": ["right_white"]},
        },
        # LAYER 4: faceが確定した後で並列生成（前髪は顔の輪郭を境界基準にする）
        {
            "hair_front":     {"depends_on": ["face"]},
            "hair_side_left": {"depends_on": ["face"]},
            "hair_side_right":{"depends_on": ["face"]},
        },
    ]
    # ============================================================

    async def generate_all_parts(
        self,
        base_image_b64: str,
        masks: dict[str, str],
        semaphore_size: int = 2,  # ⚠️ 2に制限（4だとレート制限の嵐）
    ) -> dict[str, str]:
        """
        依存グラフに基づいてレイヤー順に17パーツを生成する。
        同一レイヤー内は並列実行（semaphore=2）。レイヤー間は順次+待機。
        """
        semaphore = asyncio.Semaphore(semaphore_size)
        completed: dict[str, str] = {}

        for layer_idx, layer in enumerate(self.GENERATION_LAYERS):
            logger.info(f"LAYER {layer_idx} 生成開始: {list(layer.keys())}")

            # ⚠️ レイヤー間に待機を入れてレート制限を回避
            if layer_idx > 0:
                inter_delay = 3.0 + random.uniform(0, 2)
                await asyncio.sleep(inter_delay)

            layer_tasks = {
                part_name: self._generate_single_part(
                    semaphore=semaphore,
                    base_image_b64=base_image_b64,
                    mask_b64=masks.get(part_name),
                    part_name=part_name,
                    reference_parts={                      # 依存パーツの生成済み画像を渡す
                        dep: completed[dep]
                        for dep in config["depends_on"]
                        if dep in completed
                    },
                )
                for part_name, config in layer.items()
            }

            results = await asyncio.gather(*layer_tasks.values(), return_exceptions=True)

            for part_name, result in zip(layer_tasks.keys(), results):
                if isinstance(result, Exception):
                    logger.error(f"{part_name} 生成失敗: {result}")
                    completed[part_name] = None
                else:
                    completed[part_name] = result
                    logger.info(f"{part_name} 完了")

        return completed

    async def _generate_single_part(
        self,
        semaphore: asyncio.Semaphore,
        base_image_b64: str,
        mask_b64: str | None,
        part_name: str,
        reference_parts: dict[str, str] | None = None,
    ) -> str:
        """
        1パーツを生成してRGBA透過PNGを返す。
        reference_parts: 依存する先行生成パーツの画像（境界の矛盾防止に使用）
        """
        async with semaphore:
            part_prompt = PART_PROMPTS[part_name]
            base_bytes = base64.b64decode(base_image_b64)

            # リファレンスパーツがある場合はプロンプトに追記
            ref_note = ""
            if reference_parts:
                ref_names = [n for n, v in reference_parts.items() if v is not None]
                if ref_names:
                    ref_note = (
                        f"\n\n参照情報: {', '.join(ref_names)} パーツの生成結果も添付します。"
                        f"これらのパーツとの境界・色を合わせてください。"
                    )

            full_prompt = (
                f"この画像のキャラクターを参照して、以下のパーツだけを生成してください。\n"
                f"【必須ルール】背景は必ず純粋なグリーン（#00FF00）で塗りつぶすこと。白背景は使用禁止。グラデーション・影・テクスチャは不可。\n"
                f"キャラクターのデザイン（髪色・目の色・肌色・服装）を完全に維持すること。\n\n"
                f"生成するパーツ: {part_prompt}"
                f"{ref_note}"
            )

            contents = [types.Part.from_bytes(data=base_bytes, mime_type="image/png")]

            # 依存パーツのリファレンス画像を追加
            if reference_parts:
                for ref_name, ref_b64 in reference_parts.items():
                    if ref_b64:
                        ref_bytes = base64.b64decode(ref_b64)
                        contents.append(types.Part.from_bytes(data=ref_bytes, mime_type="image/png"))

            if mask_b64:
                mask_bytes = base64.b64decode(mask_b64)
                contents.append(types.Part.from_bytes(data=mask_bytes, mime_type="image/png"))
                full_prompt += "\n\n（白い部分が生成対象領域のマスクです）"

            contents.append(types.Part.from_text(text=full_prompt))

            # レート制限対応リトライ付きで実行
            raw_b64 = await call_with_retry(
                lambda: self._call_gemini(contents)
            )

            # ② RGBA透過フォールバック
            return ensure_rgba(raw_b64, part_name)

    async def _call_gemini(self, contents) -> str:
        response = await self.async_client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"]  # ⚠️ 公式推奨
            ),
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode()
        raise RuntimeError("Gemini が画像を返しませんでした")
```

---

### 14.3 モデルアップグレード手順（実験 → 本番）

```python
# 実験成功後の変更箇所は1行だけ
# backend/services/parts_generator.py の以下の行を変更:

# 変更前（実験フェーズ）
CURRENT_MODEL = EXPERIMENT_MODEL  # "gemini-2.5-flash-image"

# 変更後（本番フェーズ）
CURRENT_MODEL = PRODUCTION_MODEL  # "gemini-3-pro-image-preview"

# Gemini 3 Pro Image の追加機能（本番移行時に活用）:
#   - 14枚のリファレンス画像入力
#     → ベース画像を複数アングルで用意して渡すとキャラ一貫性がさらに向上
#   - 4K解像度出力（高解像度VTuber向け）
#   - Thinkingモードによる複雑な隠れ部分補完
```

---

### 14.4 コスト試算

```
【実験フェーズ（Gemini 2.5 Flash Image）】
  パーツ生成: $0.039 × 17 = $0.663/キャラ ≒ 約100円
  ベース生成: ¥0（SD WebUIローカル）
  ──────────────────────────────────
  1キャラ総コスト: 約100円

【本番フェーズ（Gemini 3 Pro Image）】
  パーツ生成: $0.134 × 17 = $2.278/キャラ ≒ 約350円
  ベース生成: ¥0（SD WebUIローカル）
  ──────────────────────────────────
  1キャラ総コスト: 約350円

【ビジネス試算（3万円サービスの場合）】
  売上:   30,000円/キャラ
  原価:     350円（API）+ インフラ費用
  粗利率:  99%以上
```

---

## 15. Stable Diffusion WebUI 完全セットアップガイド（Windows・SD未経験者向け）

### 15.0 SDとは何か・shiverでの役割

```
Stable Diffusion（SD）はローカルで動く画像生成AI。
GPUを使うため高速・無料・API費用ゼロ。

shiverにおける役割:
  STAGE 1 のベース画像生成を担当。
  AnythingV5（アニメ特化モデル）を使うことで、
  Geminiより遥かに高品質なアニメキャラを生成できる。

SD WebUI（AUTOMATIC1111）とは:
  SDをブラウザから操作できるGUIツール。
  APIモードで起動するとshiverのバックエンドから
  HTTP経由で自動呼び出しができる。
```

---

### 15.1 前提条件の確認

SD WebUIをセットアップする前に以下が完了していること（Section 2 参照）。

```powershell
# 確認コマンド（PowerShellで実行）
git --version          # 2.4x.x 以上
python --version       # 3.10.x 以上（※SDはpyenv-winのPythonとは別に動く）
nvidia-smi             # GPU名とCUDAバージョンが表示されること
nvcc --version         # CUDA 12.1.x
```

> **重要**: SD WebUIは`C:\dev\shiver`とは**別のフォルダ**に配置する。
> SDは独自のPython仮想環境を自動構築するため、プロジェクトと混在させない。

---

### 15.2 SD WebUI インストール

```powershell
# 1. SDの作業フォルダを作成
#    C:\dev\stable-diffusion-webui に配置する
cd C:\dev
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui

# 2. フォルダ構成確認（以下が存在すればOK）
dir
# 表示されるはず:
#   webui.bat
#   webui-user.bat   ← 設定ファイル（これを編集する）
#   models\          ← モデルファイルをここに置く
#   extensions\      ← 拡張機能
```

---

### 15.3 webui-user.bat の設定

```powershell
# webui-user.batをメモ帳で開く
notepad webui-user.bat
```

開いたら以下の内容に書き換える：

```bat
@echo off

rem ⚠️ PYTHON を明示的に固定すること（空のままにしない）
rem A1111は Python 3.10.6 を前提に動作確認されている。
rem pyenv-win で 3.12 をグローバル設定にしている場合、PYTHON= を空にすると
rem PATH から 3.12 を拾って起動し、依存関係の互換性エラーが出る。
rem 以下のパスはA1111が自動セットアップした Python 3.10.6 のパスに合わせること。
set PYTHON=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python310\python.exe
rem ↑ 実際のインストールパスと異なる場合は適宜修正する
rem  確認コマンド: where python3.10  または  py -3.10 -c "import sys; print(sys.executable)"

set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--api --port 7860 --xformers --no-half-vae

call webui.bat
```

> **各オプションの意味:**
> - `--api` : shiverバックエンドからHTTP呼び出しを受け付ける（**必須**）
> - `--listen` : （削除）localhost一台構成では不要。外部公開面を広げるため削除した
> - `--port 7860` : ポート番号固定（shiver設定と一致させる）
> - `--xformers` : VRAM節約・高速化（NVIDIA GPU必須）
> - `--no-half-vae` : 画像が真っ黒になるバグの防止

---

### 15.4 アニメモデルのダウンロードと配置

SDは「モデルファイル（.safetensors）」を読み込んで絵柄を決定する。
shiverには**アニメ特化モデル**が必要。以下の2つのどちらかを使う。

#### 推奨: AnythingV5（汎用アニメ・最もポピュラー）

```
ダウンロード先:
  https://huggingface.co/stablediffusionapi/anything-v5/blob/main/anything-v5-PrtRE.safetensors

手順:
  1. 上記URLをブラウザで開く
  2. 「download」ボタンをクリック（ファイルサイズ約2GB）
  3. ダウンロードしたファイルを以下の場所に移動:
     C:\dev\stable-diffusion-webui\models\Stable-diffusion\
  4. ファイル名確認: anything-v5-PrtRE.safetensors
```

#### 代替: Counterfeit-V3.0（より鮮やかな発色）

```
ダウンロード先:
  https://huggingface.co/gsdf/Counterfeit-V3.0/blob/main/Counterfeit-V3.0_fp16.safetensors

配置先: 同じく models\Stable-diffusion\ フォルダ
```

> **モデルファイルの配置確認:**
> ```
> C:\dev\stable-diffusion-webui\
>   └─ models\
>       └─ Stable-diffusion\
>           └─ anything-v5-PrtRE.safetensors  ← ここに置く
> ```

---

### 15.5 Waifu-Inpaint-XL のインストール

Waifu-Inpaint-XLはアニメ専用のインペインティング（マスク領域生成）モデル。
STAGE 2のパーツ生成品質を向上させるために使う（オプションだが強く推奨）。

```
ダウンロード先:
  https://huggingface.co/ShinoharaHare/Waifu-Inpaint-XL

ダウンロードするファイル:
  WAI-NSFW-illustrious-SDXL-V14.0-V-Prediction.safetensors（約6GB）

配置先:
  C:\dev\stable-diffusion-webui\models\Stable-diffusion\

注意:
  Waifu-Inpaint-XLはSDXLベース（モデルサイズが大きい）。
  VRAM 8GB以上のGPUが必要。
  AnythingV5（SDv1.5ベース）より高品質だが動作が重い。
  VRAMが不足する場合はAnythingV5のみで進める。
```

---

### 15.6 初回起動（自動セットアップ）

```powershell
# SD WebUI フォルダで実行
cd C:\dev\stable-diffusion-webui
webui-user.bat
```

**初回は10〜20分かかる。** 以下のような出力が出る：

```
# 自動で Python 仮想環境を構築（venv）
# PyTorchやdiffusersなどを自動インストール
# モデルのハッシュ計算
# ...
Running on local URL:  http://127.0.0.1:7860
```

`Running on local URL: http://127.0.0.1:7860` が表示されたら起動完了。

> **起動中によくあるエラーと対処:**
>
> ```
> エラー: "xformers is not installed"
> 対処: webui-user.bat の COMMANDLINE_ARGS から --xformers を削除して再起動
>
> エラー: "CUDA out of memory"
> 対処: COMMANDLINE_ARGS に --medvram を追加（VRAM節約モード）
>
> エラー: "No module named 'torch'"
> 対処: 手動でインストール
>   > cd C:\dev\stable-diffusion-webui
>   > .\venv\Scripts\activate
>   > pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
> ```

---

### 15.7 動作確認（GUI）

1. ブラウザで `http://localhost:7860` を開く
2. 上部のドロップダウンで `anything-v5-PrtRE` が選択されているか確認
3. テキストボックスに以下を入力してGenerateをクリック：

```
Prompt:
  masterpiece, best quality, anime style, 1girl, white background, front facing

Negative Prompt:
  lowres, bad anatomy, worst quality, realistic
```

アニメキャラの画像が生成されれば成功。

---

### 15.8 APIモードの確認（shiverとの接続に必須）

```
ブラウザで以下のURLを開く:
  http://localhost:7860/docs

Swagger UIが表示されれば API有効化 OK。

主要エンドポイント:
  POST /sdapi/v1/txt2img   ← テキストから画像生成（shiverが使う）
  POST /sdapi/v1/img2img   ← 画像から画像生成（参照画像機能で使う）
  GET  /sdapi/v1/sd-models ← インストール済みモデル一覧
```

---

### 15.9 API動作テスト（PowerShellから）

```powershell
# SD APIに直接リクエストを送って動作確認
$body = @{
    prompt = "masterpiece, best quality, anime style, 1girl, white background"
    negative_prompt = "lowres, bad anatomy, worst quality"
    steps = 20
    width = 512
    height = 768
    batch_size = 1
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:7860/sdapi/v1/txt2img" `
    -Method POST -ContentType "application/json" -Body $body

# 画像データ（base64）が返れば成功
Write-Host "生成成功！画像データ長: $($response.images[0].Length) 文字"
```

---

### 15.10 モデル切り替え方法（GUI）

複数のモデルをダウンロードしている場合、WebUIのトップにあるドロップダウンから切り替えられる。

```
AnythingV5:        汎用アニメ。最初はこれ。
Waifu-Inpaint-XL:  インペイント専用。パーツ生成の品質を上げたいとき。

切り替え後: 「Apply and restart」ボタンを押す（数十秒でモデルが読み込まれる）
```

---

### 15.11 SD WebUI の停止・再起動

```
停止: WebUIが動いているPowerShellウィンドウで Ctrl+C

再起動:
  cd C:\dev\stable-diffusion-webui
  webui-user.bat

VS Code launch.json に組み込む場合（後述の Section 2.13 参照）:
  SD WebUIはPythonスクリプトとして起動するため、
  launch.jsonのcompound設定には含めない。
  別のPowerShellウィンドウで手動起動するのが標準的な運用。
```

---

### 15.12 SDが起動しているか確認するコマンド

```powershell
# shiverバックエンドからSDの死活確認に使うコマンド
curl http://localhost:7860/sdapi/v1/sd-models
# {"status":"ok"} が返れば稼働中

# ポートが使われているか確認
netstat -ano | findstr :7860
# 何か表示されれば7860番ポートでプロセスが起動中
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
GPU_SERVER_HOST=localhost
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

### 18.0 runHealthCheck() の仕様定義

**全フェーズ開始前に必ず実行すること。**
`runHealthCheck()` はフロントエンドのブラウザコンソールから実行する関数。
以下の定義に従って `frontend/src/utils/healthCheck.ts` に実装すること。

```typescript
// frontend/src/utils/healthCheck.ts

interface HealthCheckResult {
  name: string;
  ok: boolean;
  message: string;
}

export async function runHealthCheck(): Promise<void> {
  const results: HealthCheckResult[] = [];

  // 1. FastAPIバックエンド疎通確認
  try {
    const res = await fetch("http://localhost:8000/");
    results.push({ name: "FastAPI Backend", ok: res.ok, message: `HTTP ${res.status}` });
  } catch (e) {
    results.push({ name: "FastAPI Backend", ok: false, message: `接続失敗: ${e}` });
  }

  // 2. SAM2 GPU Server疎通確認
  try {
    const res = await fetch("http://localhost:8001/");
    results.push({ name: "SAM2 GPU Server", ok: res.ok, message: `HTTP ${res.status}` });
  } catch (e) {
    results.push({ name: "SAM2 GPU Server", ok: false, message: `接続失敗: ${e}` });
  }

  // 3. SD WebUI疎通確認
  try {
    const res = await fetch("http://localhost:7860/sdapi/v1/sd-models");
    results.push({ name: "SD WebUI", ok: res.ok, message: res.ok ? "起動中" : `HTTP ${res.status}` });
  } catch (e) {
    results.push({ name: "SD WebUI", ok: false, message: `接続失敗（起動してない可能性）: ${e}` });
  }

  // 4. MediaPipeカメラ疎通確認（getUserMediaが使えるか）
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    results.push({ name: "Camera/MediaPipe", ok: true, message: "カメラアクセス OK" });
  } catch (e) {
    results.push({ name: "Camera/MediaPipe", ok: false, message: `カメラアクセス失敗: ${e}` });
  }

  // 結果表示
  console.group("=== shiver HealthCheck ===");
  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.name}: ${r.message}`);
    if (!r.ok) allOk = false;
  }
  console.groupEnd();

  // 失敗時は次フェーズへ進まない
  if (!allOk) {
    const failed = results.filter(r => !r.ok).map(r => r.name).join(", ");
    throw new Error(
      `HealthCheck失敗: [${failed}]\n` +
      `上記のサービスを起動してから再実行してください。\n` +
      `次のフェーズへの実装進行は禁止。`
    );
  }

  console.log("✅ 全チェック通過。実装を進めてよい。");
}

// ブラウザコンソールから実行しやすいようにグローバル登録
(window as any).runHealthCheck = runHealthCheck;
```

> **使い方:** ブラウザで `http://localhost:5173` を開き、DevToolsコンソールで `runHealthCheck()` を実行。
> **重要:** SD WebUI（localhost:7860）はPhase 2から必要。Phase 1では失敗しても続行可。

---

### Phase 1: MVP（目標: 2〜3週間）

**事前チェック:** `runHealthCheck()` 実行 → エラー0件を確認（SD WebUIはPhase 1では任意）

**実装内容:**
- [ ] FastAPI バックエンド起動（`http://localhost:8000/docs` にブラウザでアクセスして疎通確認）
- [ ] React + Vite フロントエンド起動
- [ ] カメラ + MediaPipe 顔追跡動作確認
- [ ] `public/test-parts/` に手動で用意したPNGパーツを配置（目一体・口・眉）
- [ ] PixiJSでパーツ表示
- [ ] まばたき・口開閉・眉上下・首振り（視差スクロール）が動く
- [ ] **自動まばたき**: 顔未検出時も3〜5秒に1回まばたきする（idleAnimator実装）

**完了条件:** カメラに向かって目を閉じるとアバターも閉じる。PCから離れても自動でまばたきし続ける。

---

### Phase 2: コア自動化（目標: 1〜2ヶ月）

**事前チェック:** localhost:8001 疎通確認（`curl http://localhost:8001/` またはFastAPIの `/docs` にブラウザでアクセス）

**実装内容:**
- [ ] SD WebUI 起動・API 有効化（Waifu-Inpaint-XL + AnythingV5 導入済みか確認）
- [ ] BaseImageGenerator（SD優先 / Gemini 2.5 Flashフォールバック）動作確認
- [ ] プロンプト → 4枚生成 → 選択UI
- [ ] SAM2で17パーツのマスクPNG生成（**目3層分割: 瞳/白目/上まぶた**）
- [ ] normalized_to_pixel() 変換を必ず通すこと
- [ ] **PartsGenerator（Gemini 2.5 Flash Image）でパーツ個別生成 ← v3.2コア実験**
- [ ] 生成パーツの品質確認（キャラ一貫性・隠れ部分補完・重ね合わせ時の自然さ）
- [ ] 手動補正UI
- [ ] **呼吸モーション**: 常時サインカーブでY座標±3px
- [ ] **瞳XY追跡**: FaceBlendshapesから視線方向を取得
- [ ] **物理演算（髪揺れ）**: hair_* パーツにSpringChain適用
- [ ] **キーバインド表情**: 1〜5/q/e の全7種

**完了条件:** プロンプト入力から10分以内に動くアバターが完成（ベース生成60秒+SAM2 30秒+パーツ生成75秒+人間操作）。髪が首振りに連動して自然に揺れる。ウィンクと照れが即時発動できる。

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
| SD WebUI ベース画像生成（4枚） | 60秒以内 |
| Gemini 2.5 Flash Image フォールバック（4枚） | 30秒以内 |
| SAM2 マスク生成（17パーツ） | 30秒以内 |
| Gemini パーツ個別生成（17パーツ・並列4） | 3〜5分以内 |

---

## 20. 重要な注意事項

### 20.1 物理演算のdeltaTime管理
毎フレームの経過時間を正確に計測すること。タブが非アクティブになると requestAnimationFrame が止まり、再開時に極端に大きな deltaTime が渡されることがある。`Math.min(deltaTime, 0.05)` で必ずクランプすること。

### 20.2 目の3層描画順序
`left_white`（zIndex:500）→ `left_pupil`（zIndex:600）→ `left_upper_lid`（zIndex:700）の順で描画されること。この順番が逆になると白目が瞳の上に来て見えなくなる。

### 20.3 自動まばたきと顔追跡の合成
最終的なまばたき値は `blink_face × auto_blink` の積で計算する。顔追跡が目を開いていると判定（blink=1.0）しても自動まばたきが発動中（auto_blink=0.0）なら目は閉じる。これが正しい挙動。

### 20.4 画像生成モデルの注意事項（v3.2）

**実験フェーズ（現在）: Gemini 2.5 Flash Image**
- モデルID: `gemini-2.5-flash-image`
- SynthID電子透かしが自動埋め込まれる
- アニメ特化度はSD + AnythingV5より低い（パーツ生成用・実験目的）
- 商用利用前にGoogle利用規約を確認すること

**本番フェーズ（実験成功後）: Gemini 3 Pro Image**
- モデルID: `gemini-3-pro-image-preview`
- `parts_generator.py` の `CURRENT_MODEL = PRODUCTION_MODEL` に変えるだけで移行完了
- 14参照画像入力が使えるようになりキャラ一貫性が大幅向上
- SynthID電子透かしは同様に付与される

**アップグレードのタイミング判断チェックリスト:**
- [ ] 17パーツが全て正常に生成される
- [ ] キャラの外見（髪色・目の色・顔の形）が各パーツで維持されている
- [ ] 前髪下の額・目周囲などの隠れ部分補完が自然である
- [ ] 全パーツ重ね合わせ時に大きな色ズレ・スタイル崩れがない
- 上記4つが満たされていれば2.5 Flashのまま継続。不満があれば3 Proへ。

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

### 20.7 マスクの境界線（シーム）処理【外部レビュー指摘】

SAM2が生成したマスクをそのままGeminiインペイントに渡すと、PixiJSで重ね合わせた際にパーツ境界に**1〜2pxの隙間やジャギー**が発生することがある。マスクを数ピクセル膨張（Dilation）させてからインペイントに渡すことで、パーツ同士の重なりが自然になる。

```python
# backend/services/sam2_service.py または parts_generator.py に追加

import numpy as np
from PIL import Image
import cv2

def dilate_mask(mask_b64: str, dilation_px: int = 3) -> str:
    """
    SAM2が生成したマスクを指定ピクセル数だけ膨張させる。
    パーツ境界のジャギー・隙間を防ぐために使用。

    Args:
        mask_b64: SAM2が出力したマスク画像（base64, 白=対象, 黒=保持）
        dilation_px: 膨張ピクセル数（推奨: 2〜4px）
                     大きいほど境界が自然になるが、隣接パーツへの浸食が増える

    Returns:
        膨張処理後のマスク（base64）
    """
    # base64 → numpy array
    mask_bytes = base64.b64decode(mask_b64)
    mask_img = Image.open(BytesIO(mask_bytes)).convert("L")
    mask_np = np.array(mask_img)

    # 膨張処理（Dilation）
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (dilation_px * 2 + 1, dilation_px * 2 + 1)
    )
    dilated = cv2.dilate(mask_np, kernel, iterations=1)

    # numpy array → base64
    dilated_img = Image.fromarray(dilated)
    buf = BytesIO()
    dilated_img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# parts_generator.py の _generate_single_part() 内で使用:
# mask_b64 = dilate_mask(mask_b64, dilation_px=3)  # インペイント前に膨張
```

> **dilation_px の調整目安:**
> - `2px`: 最小限の補正。高解像度（1024px以上）向け
> - `3px`: 推奨値。512×768pxのデフォルト解像度に最適
> - `4〜5px`: 境界が気になる場合。ただし前髪と顔の境界など隣接パーツが多い箇所は浸食注意

---

### 20.8 Gemini APIのレート制限（429エラー）対策【v3.2.1 最適化済み】

**実装済みの対策（base_image_generator.py + parts_generator.py）:**

1. **retryDelay解析**: 429エラーレスポンスからAPIが指定する待機時間を正規表現で抽出し尊重する
2. **リトライ回数制限**: 最大2回（合計3試行）。旧実装の5回リトライは無料枠を一瞬で消費した
3. **semaphore=2**: 同時実行を2に制限。旧実装のsemaphore=4は並列429エラーの嵐を引き起こした
4. **レイヤー間待機**: GENERATION_LAYERSの間に3〜5秒のランダム待機を挿入
5. **STAGE1順次生成**: ベース画像4枚は4〜6秒間隔で順次生成。並列は全滅リスクあり
6. **Client使い回し**: `genai.Client`は`__init__`で1回だけ作成。毎回生成はコネクション浪費

**API呼び出し回数:**
- 成功時: STAGE1(4) + STAGE2(17) = 21回
- 最悪ケース: STAGE1(4×2=8) + STAGE2(17×3=51) = 59回
- 旧実装最悪ケース: 105回 → **44%削減**

> **レート制限について:**
> - RPM/RPD制限はモデル・プランのtierによって異なり随時変更される
> - Google AI Studioの「Rate Limits」タブで現在値を確認すること
> - 無料枠で429が頻発する場合はPay-as-you-goへの切り替えを検討する

---

### 20.9 PixiJS・OBSブラウザソースの描画負荷【外部レビュー指摘】

17枚の透過PNGをzIndex付きで重ね合わせ、毎フレームメッシュ変形・視差移動を行う処理は、OBSのブラウザソースにとって無視できない負荷になる。**512×768px** という解像度設定はパフォーマンスと品質のバランスが取れた適切な値であり、変更しないこと。

```typescript
// frontend/src/utils/pixiRenderer.ts に追加

// パフォーマンス最適化設定
const PIXI_APP_OPTIONS = {
  width: 512,
  height: 768,
  backgroundAlpha: 0,           // 背景透過（OBSクロマキー不要）
  antialias: false,             // アンチエイリアスOFF（負荷削減）
  resolution: 1,                // 解像度倍率1（Retinaスケールしない）
  autoDensity: false,
  powerPreference: "high-performance" as const,  // GPU優先
};

// スプライト更新時の最適化
// ❌ 悪い例: 毎フレーム全スプライトを再生成
// sprites.forEach(s => s.destroy()); createAllSprites();

// ✅ 良い例: スプライトを使い回してプロパティだけ更新
// sprites.forEach(s => {
//   s.x = newX;          // 位置だけ更新
//   s.rotation = newRot; // 回転だけ更新
//   s.scale.set(newScale);
// });

// OBSブラウザソースでFPSが落ちる場合のチェックリスト:
// 1. OBS設定 → 「OBSによるブラウザのアクセラレーション」が ON になっているか
// 2. 「ページが非表示でもソースをアクティブにする」が ON になっているか
// 3. ブラウザソースの解像度が 512×768 に設定されているか（4K等にしない）
// 4. Chromeのハードウェアアクセラレーションが有効になっているか
```

> **参考: パーツ数と解像度の関係**
> | 解像度 | パーツ数 | 想定FPS（RTX 3060相当） |
> |--------|---------|------------------------|
> | 512×768 | 17枚 | 60fps 安定 ✅ |
> | 1024×1536 | 17枚 | 30〜45fps ⚠️ |
> | 512×768 | 30枚以上 | 45fps ⚠️ |
> 
> パーツを追加したい場合（アクセサリー・衣装等）は **512×768固定** のまま対応すること。

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
| パーツ境界にジャギー・隙間が出る | SAM2マスクが未処理 | `dilate_mask(mask_b64, dilation_px=3)` を通してからインペイントに渡す（20.7参照） |
| Geminiインペイントが途中で止まる | 429レート制限 | retryDelay解析+リトライ（最大2回）は実装済み（20.8参照）。頻発する場合は有料APIに切り替え |
| OBSでFPSが落ちる | ブラウザソース設定ミス | 「OBSによるブラウザのアクセラレーション」をONにする（20.9参照） |
| 前髪と顔パーツで肌色がズレる | 完全並列生成による矛盾 | GENERATION_LAYERSの依存グラフを確認。faceをLAYER1で先に生成しているか確認 |
| Geminiが白背景のRGB画像を返す | APIの透過出力の限界 | `ensure_rgba()` が自動対処。rembgが未インストールの場合は `pip install rembg` |
| 髪パーツのマスクが先端で切れる | SAM2アニメドメインギャップ | `compute_bbox_from_landmarks` のpadding_ratioを0.25→0.35に上げる |
| Geminiが常に呼ばれる | SDサーバー死亡 | `curl http://localhost:7860/sdapi/v1/sd-models` で確認 |
| 呼吸モーションが大きすぎる | amplitudeが大きい | `BREATH_AMPLITUDE` を 1〜2 に下げる |
| キーバインドが反応しない | フォーカスがcanvas外 | `window.addEventListener("keydown")` を使っているか確認（input要素ではなくwindow） |

---

### 20.10 サンドイッチ構造とZ-Index手動調整【Phase 3 必須要件・論文知見】

```
See-through論文の指摘:
  アニメキャラ特有の「1つのパーツが別のパーツを前と後ろから挟む」
  サンドイッチ構造は、固定Z-Indexでは表現できない。

  例: マントの場合
    マント後部 → 体の後ろ（zIndex: 200）
    体本体    → zIndex: 300
    マント前部 → 体の前（zIndex: 400）
    → マントという「1つのパーツ」が体を前後から挟む

Phase 1〜2: 固定Z-Indexで問題なし
  顔・目・眉・髪のシンプル構成なら固定Z-Indexで全て対応可能。

Phase 3以降: PartEditorにZ-Index手動調整UIを必須追加
  要件:
    - パーツ一覧を縦に並べたリスト（上が前面・下が背面）
    - ドラッグ&ドロップで前後順を変更できる
    - 「このパーツをここで分割する（前部・後部に分ける）」機能
    - 変更はプロジェクトJSONに保存される

  実装イメージ（PartEditor UI）:
    ┌──────────────────────────────┐
    │ 🔝 前面                      │
    │  ≡ hair_front    [z:1100] ↕ │
    │  ≡ left_upper_lid [z:700] ↕ │
    │  ≡ left_pupil     [z:600] ↕ │
    │  ≡ left_white     [z:500] ↕ │
    │  ≡ face           [z:300] ↕ │
    │  ≡ hair_back      [z:100] ↕ │
    │ 🔚 背面                      │
    └──────────────────────────────┘
    ※ ≡ をドラッグして順序変更。[z:xxx] の数値は自動割り当て。
```

### 20.11 rembg のインストールと注意事項

```bash
# rembg のインストール（初回は U2Netモデルをダウンロード）
pip install rembg --break-system-packages

# 初回実行時に ~200MB のモデルファイルが自動ダウンロードされる
# キャッシュ場所: C:\Users\<ユーザー名>\.u2net\

# GPU版（CUDA対応）を使いたい場合
pip install rembg[gpu] --break-system-packages
```

> **rembgのアニメ絵への適性:**
> - ✅ 単色背景からのパーツ切り抜き → 十分使える
> - ✅ シンプルな輪郭のパーツ（顔・目・眉）→ 高精度
> - ⚠️ 複雑な輪郭（飛び出た髪の毛、透けた布）→ 精度が下がる場合あり
> - 精度が不十分なパーツは手動補正UIで対応する（フォールバックの最終段）
