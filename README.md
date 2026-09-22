# JSON 注释对齐工具

适用于 Chrome、Edge 等 Chromium 浏览器的 Manifest V3 插件。点击扩展图标，在独立标签页中粘贴带注释的 JSON，格式化并全局对齐 `//` 注释。

## 构建与安装

需要 Node.js 22 或更新版本。首次构建：

```powershell
npm install
npm run verify
```

后续从锁文件恢复依赖可使用 `npm ci`。构建产物在 [dist](./dist)。

1. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目的 **dist 文件夹**，不要选择项目根目录。
4. 将扩展固定到工具栏，点击带有 `{ // }` 标识的「JSON 注释对齐工具」图标。

安装后完全离线运行，无需 Node.js 或开发服务器。源码更新后运行 `npm run build`，在扩展管理页刷新扩展并重新打开编辑页。

输入和输出编辑器使用 Cascadia Mono，并以 Liberation Mono、DejaVu Sans Mono 作为开源等宽字体回退，不依赖在线字体服务。

## 使用

- 在左栏粘贴 JSON / JSONC，点击「格式化并对齐」，或按 `Ctrl+Enter` / `⌘+Enter`。
- 输入和输出均有实时代码着色：属性名、字符串、数字、`true`/`false`/`null`、注释和标点符号分别用不同颜色显示，随输入即时更新，无语法错误也不影响正常编辑。
- 默认 2 个空格缩进，可切换为 4 个空格。
- 工具栏显示格式化后 `//` 所在的列号，中间数字可以直接编辑并按回车或失焦应用；两侧的 `<` / `>` 按钮可将全文注释列整体左右偏移 1 列并重新格式化，按住不放会先短暂延迟再连续偏移，松开即停止。列号支持 1–400。向左偏移与原 JSON 内容冲突时，该行至少保留 1 个空格再输出 `//`，其余可移动的行仍会左移对齐到新列。切换输入、缩进或换行保留选项会清除该偏移，重新按最宽一行的自然列对齐。
- 可开启「保留原始换行」，直接使用 `jsonc-parser` 的 `keepLines` 格式化效果，便于对比单行数组、短对象等结构的输出差异。
- 右上角的太阳 / 月亮开关可切换日间与暗黑外观；选择会保存在当前扩展页面中，首次使用时跟随系统主题。
- 右上角的语言按钮可在中文与 English 之间切换界面文案；选择会保存在当前扩展页面中，首次使用时跟随浏览器语言。扩展在 `chrome://extensions` 中显示的名称与描述则跟随浏览器（系统）语言，由 Chrome 的 `_locales` 机制处理。
- 「载入示例」使用一份完全虚构的播客节目目录，并立即格式化。
- 右栏支持复制和下载为 `formatted.jsonc`。
- 输入和输出文本框左侧显示行号，行号会随内容和滚动位置同步更新，便于根据语法错误提示定位输入。
- 「对比差异」以左右并排、类似 `git diff` split view 的方式展示格式化前后差异：左侧为原文、右侧为结果，按内容而非仅按行号配对，精确到字符级别高亮改动（例如新增的空格、缩进），并统计变更行数；格式化成功后才可用。
- 语法错误会显示行列位置，不输出部分格式化结果。
- 修改输入或缩进后会清除旧结果，避免误复制过期内容。
- 不自动保存输入；关闭或刷新标签页会丢失内容，请先复制或下载。

## 格式与对齐规则

输入为 **JSONC**：支持 `//` 行注释、`/* ... */` 块注释和尾随逗号，不支持单引号、未加引号的属性名、`undefined` 等 JavaScript / JSON5 语法。

1. 使用 `jsonc-parser` 校验并格式化，默认 2 空格缩进、LF 换行，文件末尾有换行。
2. 默认关闭 `keepLines`，非空数组和对象按常见的多行格式展开。因此示例中的 `[{` 会分成 `[` 和 `{` 两行；注释文字与顺序保留。开启「保留原始换行」后，格式化器会尽量沿用输入中的换行位置，但这不是“简单结构自动压缩”的专用规则。
3. 在格式化后的文本上扫描真正的行注释 token，字符串里的 `https://`、`//` 和块注释里的 `//` 不参与对齐。
4. **整个文档使用同一注释列**，包含嵌套字段、独占一行的注释、闭括号后的注释。该列至少在每行字段内容结束位置之后 1 个空格，不截断或挤占字段。不带注释的长行不影响注释列。默认取全文最宽一行所需的列；也可以通过工具栏的 `<` / `>` 按钮手动向左或向右偏移该列——向左偏移时，若某行字段内容本身已经到达或超过目标列，该行只保留 1 个空格再输出 `//`，不强迫其他行跟着右移。
5. `//` 后统一为恰好 1 个普通空格，去掉注释首尾空白，保留注释内部的空白。空注释输出为 `// `。
6. 注释列按 Unicode 码点数计算，使用等宽字体并禁用连字。中文、组合字符、Emoji 的实际显示宽度因字体而异，不保证视觉像素级对齐。
7. 不排序字段，不删除尾随逗号，不合并重复字段，不对值进行反序列化再序列化。因此大整数、指数写法、转义序列等原始 token 不会因格式化丢失。
8. 输出仍是 JSONC，不是严格 JSON；若下游只接受 JSON，需要先移除注释和尾随逗号。

例如：

```jsonc
{
  "a": 1,   // a
  "long": 2 // b
}
```

## 隐私与权限

所有资源随扩展打包，不加载 CDN，不上传文本，不注入网页，不读取浏览历史，也不申请站点权限。仅在用户点击复制时写入剪贴板，点击下载时生成本地文件。输入不写入浏览器存储。

## 开发与验证

```powershell
npm run check  # JavaScript + JSDoc 严格类型检查
npm test       # Node.js 内置测试与覆盖率
npm run build  # 打包可直接安装的扩展
```

## 发布

发布分两步：先整理面向用户的发布说明，再执行封板打包。

```powershell
npm run release -- --show-changes                   # 查看自上次发布以来的提交与改动（只读）
npm run release -- --notes release-notes.md         # 封板并升级补丁号（默认），如 1.0.0 -> 1.0.1
npm run release -- minor --notes release-notes.md   # 升级次版本号，如 1.0.0 -> 1.1.0
npm run release -- major --notes release-notes.md   # 升级主版本号，如 1.0.0 -> 2.0.0
npm run release -- 1.2.0 --notes release-notes.md   # 直接指定目标版本号
```

`--show-changes` 输出的提交记录只是素材，需要改写成面向使用者的更新内容（按 `### 新增` / `### 改进` / `### 修复` 分类，合并同一功能的多次提交，略过纯内部改动），写入一个临时文件后通过 `--notes` 传入。发布说明缺失、为空或与提交记录逐条相同时，脚本会拒绝发布。

[scripts/release.mjs](./scripts/release.mjs) 随后依次执行类型检查和测试（封板）、同步升级 `package.json` 与 `extension/manifest.json` 的版本号、在 [CHANGELOG.md](./CHANGELOG.md) 顶部写入本次发布说明、重新构建，最后将 `dist/` 打包为 `JsonAligner-<版本号>.zip` 写入项目根目录。任一步失败都会终止，不写入版本号、不更新日志也不生成 zip。

- [src/formatter.js](./src/formatter.js)：JSONC 校验、格式化和注释对齐。
- [src/highlight.js](./src/highlight.js)：JSONC 代码着色，将文本转换为带高亮 `<span>` 的 HTML。
- [src/diff.js](./src/diff.js)：逐行与逐字符 Myers 差异算法，并按内容相似度将改动行配对，供「对比差异」弹窗使用。
- [src/app.js](./src/app.js)：编辑器交互及错误反馈。
- [src/i18n.js](./src/i18n.js)：中文 / English 界面文案字典与 `data-i18n*` 属性驱动的翻译辅助函数。
- [extension/manifest.json](./extension/manifest.json)：Manifest V3 配置。
- [extension/icons](./extension/icons)：扩展图标资源，沿用页头 `{ // }` 标识生成多尺寸 PNG。
- [extension/_locales](./extension/_locales)：Chrome 扩展名称、描述等元数据的多语言文案（`chrome.i18n`）。
- [test/formatter.test.js](./test/formatter.test.js)：完整示例、字符串与注释区分、嵌套对齐、Unicode、长字段、大整数、错误输入等测试。
- [test/highlight.test.js](./test/highlight.test.js)：着色分类、HTML 转义、错误容忍和字符无损还原等测试。
- [test/diff.test.js](./test/diff.test.js)：新增、删除、替换、空输入等差异对比场景测试。

未使用压缩或替换源码的正则来识别注释，也未使用 `eval` 执行输入。

运行时依赖 `jsonc-parser`，其 MIT 许可证随构建复制到 `dist/THIRD-PARTY-NOTICES.txt`。
