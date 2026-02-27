# kingdee-xingchen-openapi-js

面向 **金蝶云·星辰 OpenAPI** 的“可执行 skill 仓库”。它把 OpenAPI 的端点目录（`api.manifest.jsonl`）与文档（`docs/*.md`）纳入统一资产，并提供一套工具链：

- **端点语义标签（tagging）**：对端点做 deterministic 分类（`op/entityType/sync/id/objectKey`），形成能力矩阵与统计摘要；
- **SDK 骨架生成（generation）**：按业务对象生成可运行的 JS 调用骨架；
- **runtime**：基于[`kingdee-sdk`](https://github.com/smartmeng/kingdee-sdk)项目二次开发后复用 `assets/runtime/kdClient.cjs`，统一鉴权与请求调用（保证 `client(req)` 形态稳定）；
- **文档采集**：使用[`金蝶知识库自动化采集工具`](https://github.com/yysf233/kingscript-knowledge-base-builder)自动化从金蝶官方API文档库采集接口文档后经过滤整理形成本项目的 `references/openapi/docs/` 资料库，供生成JS代码时参考/回退使用；

> 适用：ERP 二开/系统集成、主数据同步、订单链路打通、WMS/电商/CRM 与星辰对接可行性验证与工程化落地。

---

## 目录结构
- `SKILL.md`  
  规范与硬规则（**必须按 manifest → docs 选端点**、**URL 必须完整**、**写后读验证**等）。

- `references/openapi/`  
  金蝶官方文档采集并整理后的 OpenAPI 资料库（参考/缓存用）：
  - `api.manifest.jsonl`
  - `docs/`

- `references/openapi/_derived/`（工具生成）
  - `endpoints.tagged.json`：标签化端点清单（generator 输入）
  - `tag.summary.json`：统计摘要（模块/对象/op/sync 覆盖度）
  - `object.map.json`：业务对象映射表（可手工维护）

- `assets/runtime/kdClient.cjs`  
  `createClient()`：获取 `{ client, appToken, domain }`。其中 `client(req)` 是调用 OpenAPI 的函数。

- `tools/`
  - `tag_endpoints.cjs`：生成端点标签（1.2）
  - `gen_sdk.cjs`：生成 SDK（1.3）
  - `discover_sources.cjs`：发现资料源（优先工程目录，其次本 skill）
  - `__tests__/`：node:test 单测

- `generated/`（运行 `gen_sdk` 后生成）
  - `generated/sdk/`：生成的 SDK
  - `generated/scripts/`：可运行 sample（list/detail/save）

---

## 生成 SDK 的导出形态

`generated/sdk/index.cjs` 会导出：

- `createApi(ctx = {})`：生成所有资源对象的集合
- `create<PascalObjectKey>Api(ctx = {})`：生成单个资源对象

其中 `ctx` 推荐传入：

```js
{
  client,                 // 必需：function(req) => Promise
  openapiHost,            // 可选：默认 https://api.kingdee.com
  overrideHost: false     // 可选：当 endpointUrl 为完整 URL 时，是否用 openapiHost 覆盖 host
}
```

资源对象通常包含：
- `list/detail/save/create/update/delete/...`
- `workflow` 动作（存在则生成）
- `getRequestUrl(actionName, opts?)`：打印/检查完整 URL（便于排错）

---

## 运行时依赖与环境变量

本 skill 本身不强制 npm 工程化，但运行 `kdClient.cjs` / sample 需要 Node 能解析到依赖：

- `kingdee-sdk`
- `dotenv`（sample 与 runtime 会读取 `.env`）

---

## 常用命令（最小可执行）

```bash
# 生成端点标签（1.2）
node tools/tag_endpoints.cjs

# 生成 SDK（1.3）
node tools/gen_sdk.cjs

# 运行单测
node --test
```

---

## 使用指南（接入方式二选一）

### 方式 A：作为工程子模块（推荐）
1. 把本仓库作为子模块放到工程里。
2. 在工程根目录安装依赖：
```bash
npm i kingdee-sdk dotenv
```

### 方式 B：作为全局 skill
1. 把本项目 `git clone` 到全局 skills 目录（例如 `~/.agents/skills/kingdee-xingchen-openapi-js`）。
2. 在需要的对话里使用 `/skills` 命令（或等效命令）启用本 skill。
3. 在实际运行 `kdClient.cjs` / sample 的工程目录安装依赖：
```bash
npm i kingdee-sdk dotenv
```

`assets/runtime/kdClient.cjs` 至少需要环境变量（项目根目录创建 `.env` 文件，在其中填写以下金蝶云星辰官方用于鉴权的字段值）：
- `CLIENT_ID`
- `CLIENT_SECRET`
- `APP_KEY`
- `APP_SECRET`
- `DOMAIN`
- （可选）`OPENAPI_HOST`：默认 `https://api.kingdee.com`
