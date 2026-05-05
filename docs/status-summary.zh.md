# Long Form Rebuild 状态总结

本文档是 `long-form-rebuild/` 的当前交接说明，目标是让后续重开会话时，不需要再从零回忆项目状态。

本文档只描述 **当前源码工程真实存在的能力和问题**，不把失败实验或未落地想法写成已完成特性。

---

## 1. 工程定位

`long-form-rebuild/` 是一个独立的新插件工程，用于重建 Logseq Long Form 插件的核心体验。

约束和原则：

- 不导入、不打包、不修改原插件的发布产物
- 原仓库里的旧文件只作为行为参考
- 当前工程以 TypeScript 源码为主，可维护、可继续迭代

当前可加载目录：

- `long-form-rebuild/dist/`

构建命令：

```bash
npm install
npm run typecheck
npm run build
```

---

## 2. 当前已完成功能

以下内容已经在当前工程里实现，并且保留在代码中。

### 2.1 Long-form 模式切换

- 顶栏按钮切换长文模式
- 顶栏按钮带状态显示：
  - `LF` = Long Form
  - `OT` = Outline
- 通过给 Logseq 主容器切换 class 来启用/关闭长文样式

相关文件：

- `src/features/mode.ts`
- `src/logseq-dom.ts`
- `src/main.ts`
- `src/styles.ts`

### 2.2 长文样式基础

- 收窄内容宽度
- 调整 block 间距
- 支持正文单独的 block gap 设置
- 支持“保留缩进但隐藏 bullet”
- 隐藏原生 bullet，鼠标移到 bullet 热区时显示
- 去掉常规长文模式下的原生树线

相关设置：

- `contentWidth`
- `blockGap`
- `bodyBlockGap`
- `keepIndents`
- `indentNonHeadingChildren`

### 2.3 标题相关命令和部分自动化

已实现：

- `Toggle auto heading`
- `Set heading 1-6`
- 给 heading block 按回车时，直接创建子块
- 对 heading property / markdown heading 做一定程度的识别
- 在 DB 变更时尝试做 heading 层级归一

当前状态：

- 有一套可工作的 heading 命令和部分自动行为
- 但 **尚未完整复现原插件的标题自动缩进机制**

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

- 对以 `- ` 开头的块加长文列表样式
- 空列表项按回车时退出列表，创建同级新块
- heading 块末尾回车时创建子块

相关文件：

- `src/features/lists.ts`

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

---

## 3. 当前未完成或明确未实现的功能

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

目前存在的问题：

- `Toggle auto heading` 和自动层级联动还不够像原插件
- 标题与正文的自动结构联动仍不稳定
- 现在只能算“部分可用”，不能算“完整复现”

### 3.5 原插件级别的 visual tree 交互

状态：

- **未完成**

包括：

- 当前块祖先链的括号式辅助线
- 点击辅助线折叠/展开
- 选择性恢复原生树线

---

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
- `keepIndents`
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

- `OT` / `LF`
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
