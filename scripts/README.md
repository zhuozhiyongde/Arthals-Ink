# 博客更新日期管理工具

这个工具用于自动管理博客文章的更新日期，基于文件内容的哈希值来跟踪文章的变化。

## 功能特性

- **哈希检测**: 使用MD5哈希值检测文章内容是否发生变化
- **自动更新日期**: 当文章内容发生变化时，自动更新 `updatedDate`
- **初始化处理**: 为没有 `updatedDate` 的文章自动添加该字段
- **数据持久化**: 维护一个JSON数据库记录所有文章的元数据

## 使用方法

### 1. 安装依赖

```bash
bun install
```

### 2. 运行工具

```bash
# 使用 npm script
bun date

# 或直接运行
bun scripts/updateBlogDates.ts
```

## 工作原理

1. **扫描博客目录**: 扫描 `src/content/blog` 目录下的所有 `.md` 和 `.mdx` 文件

2. **哈希计算**: 为每个文件计算MD5哈希值

3. **数据库对比**: 将当前哈希值与数据库中存储的哈希值进行对比

4. **更新处理**:
   - **新文章**: 如果文章没有 `updatedDate`，使用 `publishDate` 作为初始值并添加到frontmatter
   - **内容变更**: 如果哈希值发生变化，更新 `updatedDate` 为当前时间
   - **无变更**: 如果哈希值相同，不做任何操作

5. **文件更新**: 自动修改文章文件，在 `publishDate` 后添加或更新 `updatedDate`

## 数据格式

工具维护的JSON数据库格式：

```json
{
  "article.md": {
    "hash": "abc123...",
    "publishDate": "2024-04-03 15:26:04",
    "updatedDate": "2024-04-03 15:26:04"
  }
}
```

## Frontmatter处理

工具会在文章的frontmatter中自动添加或更新 `updatedDate` 字段：

```yaml
---
title: 文章标题
publishDate: 2024-04-03 15:26:04
updatedDate: 2024-04-03 15:26:04 # 自动添加/更新
description: 文章描述
tags:
  - tag1
  - tag2
---
```

## 注意事项

- 工具会自动创建 `scripts/blog-metadata.json` 数据库文件
- 请确保文章的frontmatter格式正确（以 `---` 开始和结束）
- 文章必须包含 `publishDate` 字段，否则会被跳过
- 工具会自动清理数据库中已删除文件的记录
