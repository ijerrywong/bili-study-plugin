# B 站学习台（dsh-bili-study）

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 面板插件：把 B 站知识区 UP 主的视频收进「科目 → 章 → 主题」目录，边看边记笔记，并让 AI 帮你查概念、补前置知识、批量归类视频。

- 侧栏新增「B 站学习台」入口，主区域是一个完整的学习面板
- 支持 UP 主主页、收藏夹、单个视频链接，抓取后先放进「未分类」
- 目录、视频、笔记、观看进度、奖励都存在本机
- 笔记支持 Markdown 与 KaTeX 公式，可导出
- 概念速查 / 知识图谱 / 智能分类走你当前配置的 DSH 默认模型
- 不登录 B 站、不搬运视频，播放使用 B 站官方嵌入播放器

## 安装

要求 DeepSeek Harness **0.2.x**（本插件声明 `engines.dsh: >=0.2.1-rc.5 <0.3.0`）。

> ⚠️ 抓取功能依赖 B 站公开接口（含 WBI 签名）。B 站调整风控策略或接口时，抓取可能暂时失效，且不会自动恢复；命中风控 `-352` 时会自动重试（指数退避，最多 3 次）。

### 方式一：npm（推荐）

已在 npm 发布：<https://www.npmjs.com/package/dsh-bili-study>

面板：侧栏 **插件 → 添加插件**，填 `dsh-bili-study`，点 **安装**，完成后点 **立即启用**。

命令行：

```sh
# profile 名按你的安装来，Desktop 通常是 desktop，Web 通常是 web
dsh plugin --profile desktop add dsh-bili-study
```

### 方式二：GitHub（npm 不可用时的备用）

```sh
dsh plugin --profile desktop add git+https://github.com/ijerrywong/bili-study-plugin.git
```

或在面板 **添加插件** 里填同一个 Git 地址。

安装后重启 DSH（没有启用 HMR 的 profile 需要重启才加载新组合包）。

### 方式三：从源码链接（开发用）

```sh
git clone https://github.com/ijerrywong/bili-study-plugin.git
cd bili-study-plugin
dsh plugin --profile desktop add link:$PWD
```

修改 `index.js` / `client.js` / `web/` 后，重启 DSH 或触发热重载即可看到效果。

## 使用

1. **建目录**：在面板里让 AI 按你的目标生成「科目 → 章 → 主题」目录，或手动编辑。
2. **收视频**：粘贴 UP 主主页、收藏夹或单个视频链接；抓回的视频在「未分类」。
3. **归类**：把视频拖到主题下，或用「智能分类」批量分配（先预览建议，确认后才写入）。
4. **学习**：进入主题按顺序观看，右侧记笔记；公式用 `$...$` / `$$...$$`。
5. **查概念**：选中一段文字，用「概念速查」问 AI；可以生成知识图谱。
6. **补前置**：在科目里用「AI 前置连线」生成主题之间的先修关系。

## 数据与隐私

- 所有学习数据存在 `$DSH_HOME/bili-study/state.json`（默认 `~/.dsh/bili-study/state.json`），不上传。
- 插件只请求 B 站公开接口，不登录账号、不保存 Cookie、不绕过风控；请求限速约 1 次/秒。
- 「概念速查」「智能分类」「AI 前置连线」会把相关标题/主题发给当前 DSH 配置的模型，产生相应 token 消耗。
- 插件是 Host 进程内的代码，安装第三方插件等于信任其作者；请只从可信来源安装。

## 开发

```sh
# 本地链接安装后，改完重启 DSH
dsh plugin --profile desktop add link:$PWD
```

主要文件：

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半边：注册工具、`/bili-study/` 页面与 API |
| `client.js` | 浏览器半边：侧栏入口、iframe 面板、主题同步 |
| `lib/bili.js` | B 站链接解析与抓取（WBI 签名、合集/收藏夹/单视频） |
| `lib/store.js` | 本机状态读写 |
| `lib/tools.js` | 模型工具 `bili_study_save_catalog` / `bili_study_fetch` |
| `web/` | 面板前端（纯 JS + 内置 KaTeX，无外部 CDN） |

发布到 npm、GitHub 或插件索引的规则见 [PUBLISHING.md](PUBLISHING.md)。

## License

MIT
