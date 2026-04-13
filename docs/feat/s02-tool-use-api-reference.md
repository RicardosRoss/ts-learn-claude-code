# s02 接口文档：Tool Use + 文件工具阶段 API 速查

这份文档不讲抽象设计，只讲一件事：  
本阶段会用到哪些 Node.js API，它们会返回什么，真实结果大概长什么样。

## 1. 使用范围

本阶段主要涉及三类 API：

1. `node:path`
2. `node:fs`
3. `node:fs/promises`

其中：

- `safePath` 主要依赖 `path` + `fs` 的同步接口
- `runRead` / `runWrite` / `runEdit` 主要依赖 `fs/promises`

## 2. `node:path` 模块

### `path.resolve(...segments): string`

作用：

- 把多个路径片段拼起来
- 归一化 `.` / `..`
- 返回绝对路径

常用形式：

```ts
path.resolve(workspaceRoot, inputPath)
```

返回值类型：

```ts
string
```

示例：

```ts
path.resolve("/ws", "a/./b/../c")
// "/ws/a/c"
```

理解重点：

- 它只做“路径字符串归一化”，不会检查这个路径是否真的存在
- 所以 `resolve` 之后路径看起来在工作区内，不代表软链接也安全

### `path.relative(from, to): string`

作用：

- 计算从 `from` 到 `to` 的相对路径

返回值类型：

```ts
string
```

示例：

```ts
path.relative("/ws", "/ws/src/a.ts")
// "src/a.ts"

path.relative("/ws", "/etc/passwd")
// "../etc/passwd"
```

在 `safePath` 中的用途：

- 判断目标路径是否跑到工作区外

常见判断：

```ts
const rel = path.relative(root, target);
const escaped =
  rel === ".." ||
  rel.startsWith(`..${path.sep}`) ||
  path.isAbsolute(rel);
```

### `path.join(...segments): string`

作用：

- 纯拼接路径片段，并做基础规范化

返回值类型：

```ts
string
```

示例：

```ts
path.join("/ws", "src", "a.ts")
// "/ws/src/a.ts"
```

和 `resolve` 的区别：

- `join` 更像“拼”
- `resolve` 更像“从右向左得到绝对路径”

在需要“继续往下拼剩余段”时，`join` 往往更直观。

### `path.parse(filePath): path.ParsedPath`

作用：

- 把路径拆成结构化对象

返回值类型：

```ts
interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}
```

示例：

```ts
path.parse("/ws/src/a.ts")
// {
//   root: "/",
//   dir: "/ws/src",
//   base: "a.ts",
//   ext: ".ts",
//   name: "a"
// }
```

在 `safePath` 中的用途：

- 先拿到根路径，再把绝对路径拆成逐段处理的数组

### `path.dirname(filePath): string`

作用：

- 取父目录

返回值类型：

```ts
string
```

示例：

```ts
path.dirname("/ws/src/a.ts")
// "/ws/src"
```

用途：

- 处理软链接目标时，用来把相对链接目标解释为“相对于链接所在目录”

### `path.isAbsolute(filePath): boolean`

作用：

- 判断一个路径字符串是不是绝对路径

返回值类型：

```ts
boolean
```

示例：

```ts
path.isAbsolute("/ws/src/a.ts") // true
path.isAbsolute("src/a.ts")     // false
```

用途：

- 辅助判断 `path.relative` 的结果是否异常

## 3. `node:fs` 模块

### `fs.realpathSync(targetPath): string`

作用：

- 解析真实文件系统路径
- 会跟随软链接，返回最终真实位置

返回值类型：

```ts
string
```

运行示例：

```json
{
  "realpathSync": "/private/var/folders/.../real"
}
```

理解重点：

- 在 macOS 上你经常会传入 `/var/...`
- 但 `realpathSync` 可能返回 `/private/var/...`
- 这是正常行为，不是 bug

用途：

- 把 `workspaceRoot` 变成规范的真实根路径，再拿它做安全边界判断

### `fs.lstatSync(targetPath): fs.Stats`

作用：

- 读取文件状态
- 和 `statSync` 不同，它遇到软链接时返回“链接本身”的信息，不会自动跟随

返回值类型：

```ts
fs.Stats
```

运行示例：

```json
{
  "lstatType": "Stats",
  "isSymbolicLink": true,
  "isDirectory": false
}
```

为什么这里必须用 `lstatSync`：

- `safePath` 需要知道“这一段是不是软链接”
- 如果直接 `statSync`，软链接已经被跟随，信息就丢了

### `stats.isSymbolicLink(): boolean`

作用：

- 判断当前 `Stats` 对象对应的条目是不是软链接

返回值类型：

```ts
boolean
```

示例：

```ts
const stats = fs.lstatSync(linkPath);
stats.isSymbolicLink();
// true
```

### `stats.isDirectory(): boolean`

作用：

- 判断当前条目是不是目录

返回值类型：

```ts
boolean
```

示例：

```ts
const stats = fs.lstatSync(somePath);
stats.isDirectory();
// true 或 false
```

在 `safePath` 中的用途：

- 如果当前段不是目录，而后面还有剩余片段，说明后面的路径只是词法拼接，不能继续按目录深入

### `fs.readlinkSync(linkPath): string`

作用：

- 读取软链接里存的目标文本

返回值类型：

```ts
string
```

运行示例：

```json
{
  "readlinkSync": "/var/folders/.../real"
}
```

理解重点：

- 返回的是“链接里写的目标”
- 它可能是相对路径，也可能是绝对路径
- 这个返回值不代表最终真实目标已经安全

通常还要继续做一次：

```ts
const target = fs.readlinkSync(linkPath);
const resolvedTarget = path.resolve(path.dirname(linkPath), target);
```

### 错误对象上的 `error.code`

很多 `fs` API 失败时会抛异常。  
对路径策略最重要的不是整段报错文本，而是 `code`。

常见类型：

```ts
type ErrorWithCode = Error & { code?: string };
```

运行示例：

```json
{
  "name": "Error",
  "code": "ENOENT",
  "message": "ENOENT"
}
```

常见值：

- `ENOENT`
  - 路径不存在
- `ENOTDIR`
  - 某一段本该是目录，但实际上不是

在 `safePath` 中，这两类错误通常不一定代表“非法”，也可能只是“目标还没创建”。

## 4. `node:fs/promises` 模块

这些 API 主要给 `runRead` / `runWrite` / `runEdit` 用。

### `fs.promises.readFile(path, "utf8"): Promise<string>`

作用：

- 以文本形式读取文件

返回值类型：

```ts
Promise<string>
```

示例：

```ts
const text = await fs.readFile(filePath, "utf8");
// text: string
```

返回样例：

```json
{
  "readFileUtf8": "hello"
}
```

### `fs.promises.readFile(path): Promise<Buffer>`

如果不传编码，返回的不是字符串，而是 `Buffer`。

返回值类型：

```ts
Promise<Buffer>
```

运行样例：

```json
{
  "isBuffer": true,
  "content": "hello",
  "length": 5
}
```

这就是为什么文本工具里应显式传 `"utf8"`。

### `fs.promises.writeFile(path, data): Promise<void>`

作用：

- 覆盖写入文件

返回值类型：

```ts
Promise<void>
```

示例：

```ts
await fs.writeFile(filePath, "hello");
// 没有返回内容，成功即 resolve
```

理解重点：

- 它不会返回“写了多少字节”
- 成功时你只能得到“没有抛错”

### `fs.promises.mkdir(path, { recursive: true }): Promise<string | undefined>`

这是很值得单独记住的一个。

作用：

- 创建目录
- `recursive: true` 时会递归创建缺失目录

返回值类型：

```ts
Promise<string | undefined>
```

返回语义：

- 返回某个字符串：表示创建出的第一个目录路径
- 返回 `undefined`：表示目标目录本来就已经存在，或者没有新建出目录

运行样例：

```json
{
  "mkdirRecursiveReturn": "/var/folders/.../a"
}
```

实现建议：

- 除非你真的关心“创建的是哪一级目录”，否则不要依赖这个返回值
- 在文件工具里，把它当成“确保目录存在”的副作用 API 即可

### `fs.promises.rm(path, options): Promise<void>`

作用：

- 删除文件或目录

返回值类型：

```ts
Promise<void>
```

常见用法：

```ts
await fs.rm(workspace, { recursive: true, force: true });
```

这里主要用于测试清理，不是文件工具核心逻辑。

### `fs.promises.symlink(target, path): Promise<void>`

作用：

- 创建软链接

返回值类型：

```ts
Promise<void>
```

用途：

- 主要用于测试 `safePath` 是否能拦住软链接逃逸

## 5. 本阶段最容易搞错的几点

### 1. `path.resolve` 不会访问文件系统

它只能说明“字符串上看起来在工作区内”，不能说明：

- 路径存在
- 路径安全
- 软链接不会跳出去

### 2. `realpathSync` 会把路径变成真实路径

这会导致：

- 输入是 `/var/...`
- 输出变成 `/private/var/...`

如果代码里直接用字符串前缀比较，又没统一两边的规范化形式，就容易误报。

### 3. `lstatSync` 和 `statSync` 不一样

- `lstatSync` 看见的是“链接本身”
- `statSync` 看见的是“链接指向的对象”

做安全检查时，这个区别非常关键。

### 4. `readFile` 默认不返回字符串

你不传编码，就拿到 `Buffer`。  
文本工具里应明确写 `"utf8"`。

### 5. `mkdir(..., { recursive: true })` 的返回值不稳定

它不是简单的 `Promise<void>`。  
很多人第一次写时会误以为它总是没有返回值。

## 6. 建议阅读方式

写 `safePath` 时，重点看：

1. `path.resolve`
2. `path.relative`
3. `fs.realpathSync`
4. `fs.lstatSync`
5. `fs.readlinkSync`
6. `stats.isSymbolicLink`

写 `runRead` / `runWrite` / `runEdit` 时，重点看：

1. `fs.promises.readFile`
2. `fs.promises.writeFile`
3. `fs.promises.mkdir`
4. `path.dirname`

## 7. 给后续阶段的文档要求

从 `s02` 开始，后续每个阶段的接口文档都至少要回答下面四个问题：

1. 这个 API 接收什么参数？
2. 它返回什么类型？
3. 真正运行时，返回值长什么样？
4. 哪些边界行为最容易误解？

只要这四件事写清楚，学习成本会明显下降。
