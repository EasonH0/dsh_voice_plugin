# 架構設計：dsh_voice_plugin

> 版本：0.1.0（2026-08-27）　狀態：開發中　證書：Apache-2.0
> 本文件是藍圖與決策紀錄，代碼應與本文一致；變更時先更新本文再改代碼。

## 1. 目標與範圍

為 DSH Web GUI 提供本地語音輸入：

- 麥克風按鈕置於對話輸入欄發送鈕左方（Slot：`conversation.input.right`）
- 獨立「語音輸入」設定頁（Slot：`settings.section`）：輸入來源、錄音模式、快捷鍵、降噪、監聽、引擎、潤飾、自動發送
- 語音辨識全本地：sherpa-onnx 串流三語模型（粵・中・英）為主引擎，Whisper large-v3 為可選引擎
- LLM 潤飾層（預設開啟）：修錯字、加標點、斷句，再填入輸入欄
- 快捷鍵僅 DSH 頁面內有效（全域熱鍵留給未來桌面版專案）

## 2. 分層架構

```
┌────────────────────────────────────────────────────────┐
│ Client（瀏覽器，DSH Web GUI）                          │
│  ui 層：麥克風按鈕・錄音動畫・設定頁・音量表・監聽開關  │
│  capture 層：MediaDevices 採集 → Web Audio 管線        │
│    source → [noiseSuppression] → analyser(音量)        │
│    → [監聽輸出] / [MediaRecorder 錄音]                  │
│  transport 層：音訊分塊 → base64 → host.call()          │
└───────────────────────┬────────────────────────────────┘
                        │ JSON（僅 localhost）
┌───────────────────────▼────────────────────────────────┐
│ Host（Node.js，本機）                                  │
│  ingest 層：收音訊分塊、重組、推進引擎                    │
│  engine 層：IEngine 介面                               │
│    ├─ SherpaEngine（sherpa-onnx-node，串流）            │
│    ├─ WhisperEngine（可選，批次）                       │
│    └─ MockEngine（開發／單元測試用，零依賴）             │
│  polish 層：LLM 潤飾（修錯字＋標點＋斷句）               │
│  model 層：模型檔案下載・驗證・版本                      │
└───────────────────────┬────────────────────────────────┘
                        │ 文字（增量串流 + 最終潤飾結果）
┌───────────────────────▼────────────────────────────────┐
│ Client：填入輸入欄（預設手動發送，可開自動發送）          │
└────────────────────────────────────────────────────────┘
```

### 分層原則

- `src/core/` 是**平台無關純邏輯**：無 DOM、無 Node API 之外的依賴，全部可單元測試。
- `src/engines/` 實現 IEngine 介面；MockEngine 與真實引擎行為一致（含延遲與增量輸出），保證測試環境與生產一致。
- 動態 Plugin（session 內原型）與正式安裝版共用 `src/core` 與 `src/engines` 的設計契約；動態版以 MockEngine 驗證 UI 與資料流。

## 3. 資料流（串流協議）

Client → Host 單向呼叫（`host.call`），以**上傳分塊的回傳值**承載增量結果，免輪詢：

```
client: call('voice.begin', { deviceId, settings })
client: call('voice.chunk', { seq, b64 })     → 回傳 { text, partial, done:false }
  ...（每 ~250ms 一塊）
client: call('voice.end', {})                → 回傳 { text, done:true }（含潤飾後文字）
```

- 音訊：16kHz・16-bit・單聲道 PCM；每塊約 250ms；base64 編碼後 JSON 傳輸（localhost，頻寬充足）。
- 串流文字為**累積值**（每次回傳目前全文），Client 直接覆寫輸入欄，天然抗丟塊。
- 潤飾僅在 `voice.end` 後執行一次，最終文字＝潤飾結果。

## 4. 設定 Schema

| 鍵 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `engine` | `'sherpa' \| 'whisper'` | `'sherpa'` | 辨識引擎 |
| `inputDeviceId` | `string` | 空（系統預設） | 麥克風裝置 |
| `recordMode` | `'toggle' \| 'ptt'` | `'toggle'` | 錄音模式 |
| `noiseSuppression` | `boolean` | `true` | 降噪（瀏覽器語音處理） |
| `echoCancellation` | `boolean` | `true` | 回音消除 |
| `autoGainControl` | `boolean` | `true` | 自動增益 |
| `monitor` | `boolean` | `false` | 監聽輸入（降噪開則聽到降噪後效果） |
| `polish` | `boolean` | `true` | LLM 潤飾 |
| `autoSend` | `boolean` | `false` | 自動發送 |
| `hotkeys` | `{ toggle, ptt }` | 見核心 | 頁面內快捷鍵 |

設定以 `localStorage`（Client 端）＋ Host 端持久化雙份，由 `settings.mjs` 統一驗證與合併。

## 5. 錄音狀態機

```
idle ──開始──▶ starting ──權限/裝置就緒──▶ recording ──結束──▶ finalizing
 ▲                                                    │
 └────────────────────── 完成 ──◀── transcribing ◀────┘
```

- `toggle` 模式：點擊開始／點擊停止；`ptt` 模式：按住開始／鬆開停止（快捷鍵同語義）。
- 非法轉移（例：非 recording 時送 end）一律回 idle，不拋例外。

## 6. 開發路線（零安裝優先）

1. **本階段**：核心純邏輯＋單元測試（`node:test`，零第三方依賴）＋動態 Plugin 原型（MockEngine）。
2. **穩定後**（經主人批准才執行）：`npm install sherpa-onnx-node`、下載模型（Hugging Face）、接上 SherpaEngine／WhisperEngine、整合測試。
3. **落地**：由動態 Plugin 原型轉為正式可安裝 DSH 插件，開源分發。

## 7. 決策紀錄

- 2026-08-27：雙引擎架構定案（sherpa 串流主引擎＋Whisper 可選）；證書 Apache-2.0；快捷鍵僅頁面內；未來桌面版為獨立專案，本插件代碼不預留全域熱鍵耦合。
- 2026-08-27：新增降噪開關、音量進度條（輸入來源下方）、監聽開關（所聽即所得：降噪開則監聽降噪後音訊）。
- 2026-08-27：串流協議採「上傳回傳承載增量」，避免 Client 輪詢。
