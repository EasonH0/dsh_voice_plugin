# 安装 dsh-voice-input

DSH 语音输入插件（Web Speech 主引擎版）。

## 三种安装方式

### 1. GitHub 源码（推荐）

```
dsh plugin --profile web add github:EasonH0/dsh_voice_plugin
```

Git 拉取源码不跑 build，所以 `lib/` 构建产物已提交进仓库。

### 2. npm 包

```
dsh plugin --profile web add dsh-voice-input
```

### 3. 本地路径

```
dsh plugin --profile web add C:\path\to\dsh_voice_plugin
```

## 验证

```
dsh --profile web --dump-config
```

确认输出中包含 `voice-input`（name: 'dsh-voice-input'）行。

## 使用

1. 重启 DSH Web 界面（安装/移除插件后）
2. 输入栏右端出现麦克风按钮
3. 点击开始说话 → 识别文字即时写入输入栏 → 再次点击停止 → LLM 润色后回填
4. 快捷键：默认 `Alt+M` 开始/停止（备用 `Alt+V`）；按住说话（PTT）可在配置切换

## 隐私说明（重要）

Web Speech 是浏览器云端识别服务：Chrome 将音频发送至 Google、Edge 发送至微软。**音频会离开本机**，请勿在隐私敏感时刻使用。

## 移除

```
dsh plugin --profile web remove dsh-voice-input
```

移除后重启 DSH Web 界面生效。

## 配置

配置写于插件的 `cordis.patch.yml`（行内 config）：识别语言、录音模式、快捷键序列、润色开关、自动发送、关麦立即停止、润色模型跟随等。
