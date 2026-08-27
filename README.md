# dsh_voice_plugin

DSH 本地語音輸入插件（語音輸入插件項目）。

在 DSH Web GUI 輸入欄加上麥克風按鈕，說話即轉文字：語音辨識**全在本機**完成（語音永不離開電腦），轉錄後可選用 LLM 潤飾（修錯字、加標點、斷句）再填入輸入欄。

## 功能

- 麥克風按鈕：對話輸入欄發送鈕左方；點擊開始／停止錄音（錄音中有動畫）
- 語音辨識：本地引擎
  - 主引擎：sherpa-onnx 串流三語模型（粵語・中文・英文），邊說邊出字、低延遲
  - 可選引擎：Whisper large-v3（高準確率、非串流）
- LLM 潤飾（預設開啟）：修正同音錯字、補標點與斷句
- 錄音模式：點擊（toggle）與按住說（push-to-talk）並存
- 降噪開關（瀏覽器語音處理）；音量進度條（即時顯示輸入音量）
- 監聽開關：聽得到當前輸入——開降噪則聽到降噪後效果
- 快捷鍵：DSH 頁面內（預設 Alt+M 開始／停止、Alt+V 按住說），設定頁可改
- 獨立「語音輸入」設定頁：輸入來源、錄音模式、快捷鍵、降噪、監聽、引擎、潤飾、自動發送

## 架構

見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

- `src/core/`：平台無關純邏輯（設定、狀態機、音訊工具、分塊、快捷鍵）
- `src/engines/`：辨識引擎介面與實作（MockEngine 供開發／測試；SherpaEngine／WhisperEngine 於安裝階段啟用）
- `src/host/`：Host 端邏輯（LLM 潤飾 prompt 建構）
- `test/`：單元測試（Node 內建 test runner，零第三方依賴）

## 開發狀態

- [x] 核心純邏輯層與單元測試（41 項全過）
- [ ] 動態 Plugin 原型（Client UI + MockEngine 全鏈路）
- [ ] 真實引擎整合（sherpa-onnx-node 安裝、模型下載——經主人批准後執行）
- [ ] 正式 DSH 插件落地與開源分發

## 測試

```
node --test --test-isolation=none "test/*.test.mjs"
```

## 證書

Apache License 2.0（見 LICENSE）。
