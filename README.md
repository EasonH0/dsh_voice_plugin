# dsh-voice-input

DSH 語音輸入插件（DeepSeek Harness 插件）：輸入欄麥克風按鈕，說話即轉文字——**語音辨識全在本機**（語音永不離開電腦），可選 LLM 潤色（修錯字、標點、斷句）再填入輸入欄。

## 功能

- 麥克風按鈕：輸入欄發送鈕左方；點擊開始／停止錄音（錄音中有動畫）
- 本地語音辨識（雙引擎）：
  - `sherpa`：sherpa-onnx 串流三語模型（粵・中・英）——邊說邊出字、低延遲
  - `whisper`：Whisper large-v3——高準確、中英混說與程式術語辨識強（非流式）
  - `auto`（預設）：缺模型自動回退瀏覽器 Web Speech，開箱即用
- LLM 潤色（預設開）：修同音錯字、補標點、斷句（走 DSH 會話模型）
- 頁面內快捷鍵：序列組合（如 `C+V+B+N`），可在 profile 設定
- 降噪／回音消除／自動增益（瀏覽器語音處理，可設定）
- 串流文字即時寫入輸入欄；可開自動發送

## 安裝

見 [INSTALL.md](INSTALL.md)。

```bash
dsh plugin --profile web add github:EasonH0/dsh_voice_plugin
npx dsh-voice-input-models            # 下載語音模型（首次一次；--whisper 加高準確引擎）
```

## 架構

見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

- `lib/`：正式插件（host `lib/index.js`＋client bundle `lib/client.js`＋核心與引擎）
- `src/`：平台無關純邏輯（與 `lib/` 同步）
- `test/`：單元測試（`npm test`，零第三方測試依賴）
- `tools/`：模型下載 bin（`dsh-voice-input-models`）
- `scripts/`：開發用 CLI（wav 辨識煙霧測試、音訊轉檔）
- `dynamic-plugin/`：動態插件原型源碼（開發歷程，不隨正式包分發）

## 開發

```
npm test                              # 單元測試
node scripts/recognize-wav.mjs <wav>  # sherpa 煙霧測試
node scripts/recognize-whisper.mjs <wav>  # whisper 煙霧測試
```

## 證書

Apache-2.0（見 LICENSE）。模型版權屬各自作者。
