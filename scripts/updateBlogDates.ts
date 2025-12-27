#!/usr/bin/env node
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
}

// 彩色输出函数
function colorLog(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`)
}

function successLog(message: string): void {
  colorLog(`✅ ${message}`, colors.green)
}

function infoLog(message: string): void {
  colorLog(`ℹ️  ${message}`, colors.cyan)
}

function warningLog(message: string): void {
  colorLog(`⚠️  ${message}`, colors.yellow)
}

function errorLog(message: string): void {
  colorLog(`❌ ${message}`, colors.red)
}

function updateLog(message: string): void {
  colorLog(`🔄 ${message}`, colors.magenta)
}

function newLog(message: string): void {
  colorLog(`📝 ${message}`, colors.blue)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ArticleMetadata {
  hash: string
  publishDate: string
  updatedDate: string
}

interface ArticleDatabase {
  [filename: string]: ArticleMetadata
}

const BLOG_DIR = path.join(__dirname, '../src/content/blog')
const DATABASE_FILE = path.join(__dirname, 'blog-metadata.json')

/**
 * 计算文件内容的MD5哈希值
 */
function calculateHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * 解析文章的frontmatter
 */
function parseFrontmatter(content: string): {
  frontmatter: string
  body: string
  publishDate: string | null
  updatedDate: string | null
} {
  const lines = content.split('\n')

  if (lines[0] !== '---') {
    throw new Error('Invalid frontmatter format')
  }

  let frontmatterEnd = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      frontmatterEnd = i
      break
    }
  }

  if (frontmatterEnd === -1) {
    throw new Error('Frontmatter not properly closed')
  }

  const frontmatterLines = lines.slice(1, frontmatterEnd)
  const bodyLines = lines.slice(frontmatterEnd + 1)

  let publishDate: string | null = null
  let updatedDate: string | null = null

  // 解析 publishDate 和 updatedDate
  for (const line of frontmatterLines) {
    const publishMatch = line.match(/^publishDate:\s*(.+)$/)
    if (publishMatch) {
      publishDate = publishMatch[1].trim()
    }

    const updatedMatch = line.match(/^updatedDate:\s*(.+)$/)
    if (updatedMatch) {
      updatedDate = updatedMatch[1].trim()
    }
  }

  return {
    frontmatter: frontmatterLines.join('\n'),
    body: bodyLines.join('\n'),
    publishDate,
    updatedDate
  }
}

/**
 * 构建新的frontmatter，如果需要的话添加updatedDate
 */
function buildFrontmatter(frontmatter: string, publishDate: string, updatedDate: string): string {
  const lines = frontmatter.split('\n')
  const newLines: string[] = []
  let publishDateFound = false
  let updatedDateAdded = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.match(/^publishDate:/)) {
      newLines.push(line)
      publishDateFound = true
      // 在publishDate后立即添加updatedDate（如果还没有添加的话）
      if (!updatedDateAdded) {
        newLines.push(`updatedDate: ${updatedDate}`)
        updatedDateAdded = true
      }
    } else if (line.match(/^updatedDate:/)) {
      // 如果还没有添加updatedDate，则添加；否则跳过（避免重复）
      if (!updatedDateAdded) {
        newLines.push(`updatedDate: ${updatedDate}`)
        updatedDateAdded = true
      }
      // 跳过所有现有的updatedDate行
    } else {
      newLines.push(line)
    }
  }

  // 如果没有找到publishDate，在末尾添加
  if (!publishDateFound) {
    newLines.push(`publishDate: ${publishDate}`)
    newLines.push(`updatedDate: ${updatedDate}`)
  } else if (!updatedDateAdded) {
    // 如果有publishDate但没有添加updatedDate，在末尾添加
    newLines.push(`updatedDate: ${updatedDate}`)
  }

  return newLines.join('\n')
}

/**
 * 格式化日期为指定格式
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 读取或创建数据库
 */
async function loadDatabase(): Promise<ArticleDatabase> {
  try {
    const content = await fs.readFile(DATABASE_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    infoLog('Creating new database...')
    return {}
  }
}

/**
 * 保存数据库
 */
async function saveDatabase(database: ArticleDatabase): Promise<void> {
  await fs.writeFile(DATABASE_FILE, JSON.stringify(database, null, 2))
}

/**
 * 处理单个文章文件
 */
async function processArticle(
  filePath: string,
  filename: string,
  database: ArticleDatabase
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8')
  const hash = calculateHash(content)

  try {
    const { frontmatter, body, publishDate, updatedDate } = parseFrontmatter(content)

    if (!publishDate) {
      warningLog(`${filename} has no publishDate, skipping...`)
      return
    }

    const existingEntry = database[filename]
    const now = new Date()
    const currentTime = formatDate(now)

    if (!existingEntry) {
      // 新文章
      const finalUpdatedDate = updatedDate || publishDate

      database[filename] = {
        hash,
        publishDate,
        updatedDate: finalUpdatedDate
      }

      // 对于新文章，只记录到数据库，不修改原文件
      if (!updatedDate) {
        newLog(`${filename} recorded (will add updatedDate when content changes)`)
      } else {
        newLog(`${filename} added to database`)
      }
    } else if (existingEntry.hash !== hash) {
      // 内容已更改
      database[filename] = {
        ...existingEntry,
        hash,
        updatedDate: currentTime
      }

      // 更新文件中的updatedDate（如果原文件没有updatedDate则添加，有则更新）
      const newFrontmatter = buildFrontmatter(frontmatter, publishDate, currentTime)
      const newContent = `---\n${newFrontmatter}\n---\n${body}`
      await fs.writeFile(filePath, newContent)

      // 重新计算更新后文件的哈希值并更新数据库
      const updatedHash = calculateHash(newContent)
      database[filename] = {
        ...existingEntry,
        hash: updatedHash,
        updatedDate: currentTime
      }

      if (!updatedDate) {
        updateLog(`${filename} - Added updatedDate`)
      } else {
        updateLog(`${filename} - Updated updatedDate`)
      }
    }
    // 移除 "No changes" 的输出，不显示无变化的文件
  } catch (error) {
    errorLog(`Error processing ${filename}: ${error}`)
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  colorLog('\n🚀 Starting blog date update process...', colors.bright)

  try {
    // 确保脚本目录存在
    await fs.mkdir(path.dirname(DATABASE_FILE), { recursive: true })

    // 读取数据库
    const database = await loadDatabase()

    // 读取博客目录
    const files = await fs.readdir(BLOG_DIR)
    const markdownFiles = files.filter((file) => file.endsWith('.md') || file.endsWith('.mdx'))

    infoLog(`Found ${markdownFiles.length} markdown files`)

    let processedCount = 0
    let changedCount = 0
    let newCount = 0

    // 处理每个文件
    for (const filename of markdownFiles) {
      const filePath = path.join(BLOG_DIR, filename)
      const beforeCount = Object.keys(database).length
      const existingEntry = database[filename]

      await processArticle(filePath, filename, database)

      // 统计变化
      const afterCount = Object.keys(database).length
      if (!existingEntry) {
        newCount++
      } else if (
        existingEntry &&
        database[filename] &&
        existingEntry.hash !== database[filename].hash
      ) {
        changedCount++
      }
      processedCount++
    }

    // 清理数据库中不存在的文件
    const existingFiles = new Set(markdownFiles)
    let deletedCount = 0
    for (const filename of Object.keys(database)) {
      if (!existingFiles.has(filename)) {
        warningLog(`Removing deleted file from database: ${filename}`)
        delete database[filename]
        deletedCount++
      }
    }

    // 保存数据库
    await saveDatabase(database)

    // 总结信息
    colorLog('\n📊 Summary:', colors.bright)
    infoLog(`Total files processed: ${processedCount}`)
    if (newCount > 0) newLog(`New files: ${newCount}`)
    if (changedCount > 0) updateLog(`Updated files: ${changedCount}`)
    if (deletedCount > 0) warningLog(`Deleted files: ${deletedCount}`)

    successLog('Blog date update process completed!')
    infoLog(`Database saved to: ${DATABASE_FILE}`)
  } catch (error) {
    errorLog(`Fatal error: ${error}`)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main as updateBlogDates }
