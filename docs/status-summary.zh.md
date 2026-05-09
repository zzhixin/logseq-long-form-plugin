# logseq-long-form-plugin 状态总结

本文档是 `logseq-long-form-plugin/` 的当前交接说明，目标是让后续重开会话时，不需要再从零回忆项目状态。

本文档只描述 **当前源码工程真实存在的能力和问题**，不把失败实验或未落地想法写成已完成特性。

---

## 1. 工程定位

`logseq-long-form-plugin/` 是一个独立的新插件工程，用于重建 Logseq Long Form 插件的核心体验。

开发动机：

- 更好地支持“长文缩进模式”
- 经典插件 [logseq-long-form](https://github.com/sethyuan/logseq-long-form) 在 Windows 11 下的长文缩进模式存在可用性问题
- 同时，经典插件在显示模式切换上的路径相对更深
- 希望把“增强粘贴”和“粘贴后按标题关系自动整理”并入同一个写作插件，而不是依赖额外插件拼装工作流
- 当前工程希望把核心写作流收敛成三个可直接切换的状态：
  - 传统长文模式
  - 长文缩进模式
  - 大纲模式

约束和原则：

- 不导入、不打包、不修改原插件的发布产物
- 原仓库里的旧文件只作为行为参考
- 当前工程以 TypeScript 源码为主，可维护、可继续迭代

当前可加载目录：

- `logseq-long-form-plugin/dist/`

构建命令：

```bash
npm install
npm run typecheck
npm run build
```

当前版本号：

- `0.2.1`

当前对外定位：

- 可进入更广泛测试的预览版
- 适合真实写作使用
- 仍保留少量宿主竞态边界，需要在 README 中明确说明

---

## 2. 当前已完成功能

以下内容已经在当前工程里实现，并且保留在代码中。

### 2.1 显示模式切换

- 顶栏按钮循环切换三种显示模式：
  - `长文` = 长文模式无缩进
  - `长文·缩进` = 长文模式有缩进
  - `大纲` = Logseq 原生大纲模式
- 通过给 Logseq 主容器切换 `lf-long-form` / `lf-keep-indents` class 来控制样式

相关文件：

- `src/features/mode.ts`
- `src/logseq-dom.ts`
- `src/main.ts`
- `src/styles.ts`

### 2.2 长文样式基础

- 收窄内容宽度
- 调整 block 间距
- 支持正文单独的 block gap 设置
- 顶栏按钮支持三态切换：长文无缩进、长文有缩进、大纲模式
- 隐藏原生 bullet，鼠标移到 bullet 热区时显示
- 去掉常规长文模式下的原生树线

相关设置：

- `contentWidth`
- `blockGap`
- `bodyBlockGap`
- `indentNonHeadingChildren`

### 2.3 标题相关命令

已实现：

- `Toggle auto heading`
- `Set heading 1-6`
- `Normalize selected/current headings`
- `Normalize current page headings`
- 对 heading property / markdown heading 做识别
- 手动设置 heading 时会做结构归一

当前状态：

- 手动 heading 命令稳定可用
- 手动 normalize 会先退出编辑态，再按上下文重排标题层级
- 标题块输入完成后按回车，会在 `insert-blocks` 阶段做结构归位与子块自动缩进
- 这条自动化在正常输入节奏下可用
- 极端快速输入时，仍可能碰到宿主编辑器事务竞态

相关文件：

- `src/features/headings.ts`
- `src/features/lists.ts`

### 2.4 Meta Block

已实现：

- 创建 meta block
- 若已有 meta block，则直接聚焦已有块
- 全局显示 / 隐藏 meta block
- 当前块局部显示 / 隐藏 meta block

约定：

- 使用 `#.meta-block`

相关文件：

- `src/features/meta-block.ts`
- `src/styles.ts`

### 2.5 列表增强

已实现：

- 长文模式下保留 Logseq 原生 `numbered list` 的编号显示
- 对块内容以 `- ` 开头的项目，在长文模式下显示 unordered list 圆点
- 对普通 `- ` 项，长文模式下隐藏可见前缀
- 对包含 inline code 的 `- \`...\`` 项，改为只隐藏渲染前缀，不再镜像整段文本，因此不会出现重影
- 顶层 numbered list 保持与普通正文左对齐
- 嵌套 numbered list 和 unordered list 在长文模式下逐层缩进
- 长文无缩进模式和长文缩进模式的 list 对齐规则已经重新收拢，视觉行为更接近
- 非空 unordered list 项末尾按回车时，创建下一个 `- ` 列表项
- 空列表项按回车时退出列表，创建同级新块
- heading 块末尾回车时创建子块

相关文件：

- `src/features/lists.ts`
- `src/styles.ts`

### 2.6 间隙日志时间戳

已实现：

- 插入：

```text
time:: HH:mm
```

相关文件：

- `src/features/journal.ts`

### 2.7 Markdown 导出

已实现：

- 打开导出对话框
- 复制当前页面或当前块为 markdown
- 导出时会清理部分长文专用标签

当前状态：

- 可以使用
- ordered list 导出已支持同级连续编号
- 多级 ordered list 导出已支持按层级切换 marker
- 但 **导出规则还不是原插件级别的完整复刻**

相关文件：

- `src/features/export-markdown.ts`

### 2.8 字数统计栏

已实现：

- 长文模式下显示浮动字数统计
- 可设置目标字数
- 达标时显示完成状态
- 字号可通过设置调整
- 风格已改为更接近 Logseq 主题色

相关设置：

- `wordCountGoal`
- `wordCountFontSize`

相关文件：

- `src/features/word-count.ts`
- `src/styles.ts`

### 2.9 调试开关

已实现：

- 设置项 `debugLogging`
- 默认关闭
- 打开后才会启用：
  - heading 调试日志
  - list 调试日志
  - input / DB / indent 诊断输出
  - internal probe

说明：

- 修改该设置后建议 reload 插件
- 正常使用时保持关闭，避免控制台噪音

### 2.10 粘贴增强

已实现：

- 编辑态下接管 `Ctrl+V` / `Cmd+V`
- 如果剪贴板文本中包含 base64 图片：
  - 自动写入当前图谱的 `assets/`
  - 自动插入 markdown 图片引用
- 普通文本粘贴保持可用
- 多行文本粘贴在开启设置时可自动拆成 sibling blocks
- fenced code block 和 `$$ ... $$` 多行内容不会被错误拆块
- 每次自动粘贴后，会只对“刚粘贴出来的块”执行一次 auto heading

相关文件：

- `src/features/paste.ts`
- `src/features/headings.ts`
- `src/settings.ts`

---

## 3. 发布建议

如果要推送到官方插件库，当前版本更适合作为：

- 预览版 / beta 心态发布

原因：

- 主流程已经可用
- 长文模式、标题回车、列表渲染、导出、字数统计都已成型
- 但仍存在少量 Logseq 宿主层面的已知边界，例如极快输入时的编辑事务竞态，以及插件 reload 后的命令注册警告

建议对外描述：

- 强调这是“long-form writing experience for Logseq”
- 清楚列出已知限制
- 将 `Debug logging` 作为问题排查入口，而不是默认行为

---

## 4. 当前未完成或明确未实现的功能

以下内容 **没有完成**，或者已经尝试过但当前版本中已清理掉。

### 3.1 Visual aids / threading guides

状态：

- **未完成**
- 曾尝试实现“当前块祖先链的 visual aids”
- 但在实际 Logseq 环境中始终无法稳定显示
- 为避免继续保留无效代码，相关实验性实现已从当前工程中移除

结论：

- 这项能力后续应视为一个独立功能重新设计
- 不要基于本轮失败实现继续修补

### 3.2 Layout 切换

状态：

- **已移除**
- 早期做过 layout 相关骨架，但用户反馈无实际价值
- 现在不再保留

### 3.3 键盘快捷键

状态：

- **已移除**
- 当前版本只保留：
  - 顶栏按钮
  - 命令面板
  - 部分 block context menu

### 3.4 原插件级别的自动标题缩进体验

状态：

- **未完成**

当前结论：

- Logseq 在编辑器里看到的 markdown heading 文本，和插件在 `save-block` / outliner 事务里看到的内容，不是同一份原始输入
- `### ` 这类输入在宿主保存链路中会先被 `trim`，并在后续标题处理里继续被规范化
- 插件如果在 `save-block` 那一拍直接改结构，容易和宿主 editor 重挂、光标位置、Enter 后插入块等事务冲突
- 当前源码已经改成：`save-block` 只观察，真正的结构归位放到 `insert-blocks` 之后处理

源码确认点：

- `frontend.components.editor/mock-textarea` 的 `did-update` 会调用 `handle-last-input`
- `handle-last-input` 只处理 `/`、`#` 搜索和 `1. ` number list，不处理 heading 自动转换
- `frontend.handler.editor/save-block-aux!` 会先 `string/trim`
- outliner 保存链和 `batch-set-heading!` 还会继续清理 markdown heading 前缀

因此当前策略：

- 保留稳定的手动 heading 命令
- 自动标题结构归位只在块完成输入并按回车后触发
- 自动子块缩进使用宿主命令 `logseq.editor/indent` / `outdent`
- 对已开始输入的新子块，尽量恢复已输入内容与光标
- 但不承诺覆盖极端高速输入竞态

### 3.5 原插件级别的 visual tree 交互

状态：

- **未完成**

包括：

- 当前块祖先链的括号式辅助线
- 点击辅助线折叠/展开
- 选择性恢复原生树线

### 3.6 Unordered list / `- ` bullet

当前实现：

- 不写入 `logseq.order-list-type:: bullet`
- 只根据块内容前缀 `- ` 做渲染增强
- 编辑态保留原始 `- ` 文本
- preview 状态下：
  - 普通文本列表项使用镜像文本方案隐藏 `- `
  - 含 inline code 的列表项改为直接隐藏渲染前缀，避免代码重影
- 非空 `- ` 项末尾回车时，尝试创建下一个 `- ` 项

## 4. 已清理的无效代码

本轮已经从最终工程中清理掉这些“未真正交付”的部分：

- `src/features/visual-aids.ts`
- `showVisualAids` 设置项
- `journalShortcut` 这种仅文案存在、没有实际绑定行为的设置项
- 旧的 visual aids 样式和运行时调用链

目的：

- 保证 `long-form-rebuild/` 只保留真实可交付或至少真实在用的代码
- 避免后续会话把失败实验误判成现成功能

---

## 5. 当前保留的设置项

当前插件设置里保留的主要项：

- `enabledForRightSidebar`
- `displayMode`（由顶栏三态按钮写入，不在设置面板中显示）
- `indentNonHeadingChildren`
- `showMetaBlocks`
- `showTimestamps`
- `contentWidth`
- `blockGap`
- `bodyBlockGap`
- `wordCountGoal`
- `wordCountFontSize`

设置定义文件：

- `src/settings.ts`

---

## 6. 当前主要入口与文件结构

### 6.1 核心入口

- `src/main.ts`

负责：

- 注册设置
- 注册样式
- 注册命令
- 注册 toolbar 按钮
- 安装运行时同步钩子

### 6.2 模式和 DOM

- `src/logseq-dom.ts`
- `src/features/mode.ts`

### 6.3 样式

- `src/styles.ts`

### 6.4 功能模块

- `src/features/headings.ts`
- `src/features/lists.ts`
- `src/features/meta-block.ts`
- `src/features/export-markdown.ts`
- `src/features/journal.ts`
- `src/features/word-count.ts`
- `src/features/runtime-sync.ts`

### 6.5 类型

- `src/types.ts`

---

## 7. 当前 UI 入口

### 7.1 顶栏按钮

- `长文` / `长文·缩进` / `大纲`
- `Export`

### 7.2 命令面板

当前仍保留的命令包括：

- Toggle long-form mode
- Toggle auto heading
- Set heading 1-6
- Create meta block
- Toggle current meta visibility
- Toggle global meta visibility
- Show markdown export dialog
- Copy current page or block as markdown
- Insert interstitial journal timestamp

### 7.3 Block context menu

当前保留：

- Toggle auto heading
- Create meta block
- Toggle current meta
- Copy markdown

---

## 8. 当前最值得继续做的事情

如果以后重新开会话，优先级建议如下。

### 优先级 A：标题系统重做

原因：

- 这是最接近原插件核心体验的一部分
- 也是当前“部分可用但不够像”的最大缺口

建议方向：

- 不要继续在现有 `toggleAutoHeading()` 周围小修小补
- 应该把“heading property / markdown heading / block depth / enter 行为”当成一个完整模型重构

### 优先级 B：导出规则补全

原因：

- 现有导出能用，但行为还不够像原插件
- 这是一个边界清晰、适合独立推进的模块

### 优先级 C：visual aids 重新设计

原因：

- 原插件特色很强
- 但本轮尝试已经证明，继续修补失败版本没有意义

建议方向：

- 下次重做时，先验证 Logseq 当前 DOM 和原生树线结构
- 用最小可见原型确认“祖先链显示”可行后，再做样式和点击交互

---

## 9. 重新开始时的注意事项

以后如果重开会话，务必先带上这些事实：

1. 当前工程已经是独立源码工程，不要再回到旧 bundle 上修。
2. `dist/` 是可加载产物，但真实维护对象是 `src/`。
3. visual aids 当前版本已经确认失败并清理，不要假设它还存在。
4. 标题系统是当前最大未完成项。
5. 不要把旧 README 里的 layout / shortcuts / visual aids 当成现状。

---

## 10. 一句话总结

当前 `long-form-rebuild/` 已经是一个 **能加载、能写、能导出、能做基础长文工作的重建版插件**；  
但它还 **没有完整复现原插件最难的两部分：标题自动结构行为和 visual aids**。
