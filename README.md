# dsh-voice-input

DSH（DeepSeek Harness）语音输入插件：输入栏麦克风按钮 → 说话 → 文字填入输入栏，可选 LLM 润色。

- **零安装、零模型下载**：主引擎使用浏览器内置 Web Speech API，开箱即用
- **LLM 润色**：修正同音错字、补标点断句、粤语口语 → 繁体中文书面语（跟随 DSH 会话模型）
- **录音模式**：点击开始/停止（toggle，默认）＋ 按住说话（PTT）
- **快捷键序列**：任意长度按键序列（顺序感应），默认 `Alt+M` 开始/停止（备用 `Alt+V`）
- **零 npm 依赖**：插件本体无运行时依赖

## 隐私说明（重要）

Web Speech 是浏览器云端识别服务：Chrome 将音频发送至 Google、Edge 发送至微软。**音频会离开本机**，请勿在隐私敏感时刻使用。润色文字经由 DSH 会话模型路径处理（与正常对话相同）。

## 安装

```
dsh plugin --profile web add github:EasonH0/dsh_voice_plugin
```

详见 [INSTALL.md](./INSTALL.md)。

## 开发

```
node scripts/build.mjs                       # 构建：src/ → lib/（lib/ 为提交产物）
node --test --test-isolation=none "test/*.test.mjs"   # 单元测试
```

目录结构：

```
src/core/*.js   纯逻辑（快捷鍵序列/draft 合并/設定 schema/音量/文案，可单测）
src/host.js     host 半源碼（/voice-input RPC + LLM 润色）
src/client.js   client 半源碼（麦克风按钮 + Web Speech + 快捷鍵 + 草稿串流）
scripts/build.mjs   零依赖构建（src/ 拼成 lib/ 单文件 bundle）
lib/            构建产物（提交进 repo：GitHub 源码安装不跑 build）
test/           单元测试
```

## 许可证

Apache-2.0
