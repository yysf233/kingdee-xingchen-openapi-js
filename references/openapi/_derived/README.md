# _derived 产物说明

本目录用于存放由工具自动生成的衍生数据，不覆盖原始 `manifest/docs`。

## 文件说明

- `endpoints.tagged.json`  
  端点标签化结果（数组）。每个元素核心字段：
  - `module`: 模块名（归一化）
  - `group`: 业务对象名（归一化）
  - `title`: 端点标题
  - `method`: HTTP 方法
  - `pathOrUrl`: manifest/docs 解析到的 path 或完整 url
  - `isRelative`: `pathOrUrl` 是否相对路径
  - `docPath`: 对应文档路径
  - `objectKey`: 稳定对象键（用于代码生成）
  - `actionKey`: 等于 `tags.op`
  - `tags`:
    - `op`: 操作标签（read/write/workflow/io/other）
    - `entityType`: `masterdata | document | other`
    - `sync`: 同步能力标签数组
    - `id`: 标识策略标签数组
  - `raw`: 原始 manifest 记录

- `tag.summary.json`  
  标签统计摘要（模块/对象数量、endpoint 数量、op 覆盖、sync 覆盖、缺失映射建议）。

- `object.map.json`  
  业务对象映射表（可手工维护）。key 为对象名（中英文均可），value 为稳定 `objectKey`（建议 camelCase）。

## object.map.json 维护方式

1. 首次执行 `node tools/tag_endpoints.cjs` 会自动创建默认映射文件。  
2. 后续建议手动补齐新对象映射，避免 fallback hash key。  
3. 工具不会自动改写你已有的映射内容，只会在 `tag.summary.json` 给出缺失建议。  
4. 修改映射后，重新执行 `node tools/tag_endpoints.cjs` 再执行 `node tools/gen_sdk.cjs`。
