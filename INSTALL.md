# dsh-voice-input 安裝說明

DSH 語音輸入插件：本地語音辨識（語音不離開本機）＋ LLM 潤色。

## 需求

- DeepSeek Harness（DSH）
- Node.js ≥ 18
- 瀏覽器麥克風權限（首次錄音時授權）

## 安裝（從 GitHub 儲存庫）

```bash
# 1. 安裝插件（GitHub 源碼；建議鎖定 commit）
dsh plugin --profile web add github:EasonH0/dsh_voice_plugin

# 2. 若 pnpm 要求授權建置腳本，依提示在該 profile 的 pnpm-workspace.yaml
#    加入 allowBuilds 後重跑 add：
#    allowBuilds:
#      - dsh-voice-input
#  （本插件 prepare 不會跑任何下載，只做靜態複製，無安全風險）
```

或本機路徑／npm（未來發布後）：

```bash
dsh plugin --profile web add ./dsh_voice_plugin          # 本機路徑
dsh plugin --profile web add dsh-voice-input             # npm（發布後）
```

## 下載語音模型（首次使用前一次）

模型不進 Git／npm（體積大），由獨立工具下載到本機：

```bash
# 日常流式引擎（sherpa 串流三語：粵・中・英，int8，約 230MB）
npx dsh-voice-input-models

# 高準確引擎（Whisper large-v3 量化版，約 2GB；中英混說／程式術語場景推薦）
npx dsh-voice-input-models --whisper

# 自訂目錄（預設下載到 <cwd>/dsh-voice-input-models）
npx dsh-voice-input-models --dir "D:\dsh-models"
```

## 設定（profile 的 cordis.patch.yml）

安裝後在該 profile 的 `cordis.patch.yml` 找到 `- id: voice-input` 行，依需要調整：

```yaml
- insert:
    - id: voice-input
      name: 'dsh-voice-input'
      inject: [connection]
      config:
        engine: auto            # auto | sherpa（流式低延遲）| whisper（高準確、非流式）
        modelDir: ''            # 留空 = <cwd>/dsh-voice-input-models
        hotkey: 'Alt+KeyM'      # 開始/停止錄音（可自訂按鍵序列，如 KeyC+KeyV）
        hotkeyAlt: 'Alt+KeyV'   # 備用快捷鍵
        polish: true            # LLM 潤色（修錯字、標點、斷句）
        autoSend: false         # 轉寫完成後自動發送
        noiseSuppression: true  # 降噪
        echoCancellation: false # 回音消除（無回音環境慎開）
        autoGainControl: true   # 自動增益
```

改完重啟 DSH 生效：`dsh --profile web`

## 使用

1. 輸入欄發送鈕左方點**麥克風按鈕**（或按快捷鍵 `Alt+M`）
2. 說話（廣東話／普通話／英文、可混說）——串流文字即時寫入輸入欄
3. 再點一次停止 → LLM 潤色 → 填入輸入欄（可開 autoSend 自動發送）

## 引擎策略

| engine | 特性 | 適用 |
|---|---|---|
| `sherpa` | 串流、邊說邊出字、RTF 極低 | 日常、純中文／普通話 |
| `whisper` | 高準確、中英混說強、錄完整段後辨識 | 程式術語／中英混說 |
| `auto`（預設） | 有模型用 sherpa；無模型回退瀏覽器 Web Speech 兜底 | 開箱即用 |

## 解除安裝

```bash
dsh plugin --profile web remove dsh-voice-input
```

## 證書

Apache-2.0。模型版權屬各自作者（sherpa-onnx：Apache-2.0；Whisper：MIT）。
