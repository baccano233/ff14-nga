import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, '../data/ff14-hot.json')
const fid = process.env.NGA_FID || '-362960'
const limit = Number(process.env.NGA_LIMIT || 20)
const forumUrl = process.env.NGA_URL || `https://bbs.nga.cn/thread.php?fid=${encodeURIComponent(fid)}`
const userAgent =
  process.env.NGA_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

async function main() {
  const html = await fetchNgaHtml(forumUrl)
  const posts = parseNgaThreadList(html).slice(0, limit)
  const payload = {
    success: posts.length > 0,
    source: forumUrl,
    lastUpdated: new Date().toISOString(),
    count: posts.length,
    posts,
    data: posts,
  }
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${posts.length} posts to ${outputPath}`)
}

async function fetchNgaHtml(url) {
  const headers = {
    'User-Agent': userAgent,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://bbs.nga.cn/',
  'Cache-Control': 'no-cache',
  }
  if (process.env.NGA_COOKIE) {
    headers.Cookie = process.env.NGA_COOKIE
  }

  const response = await fetch(url, {
    headers,
  })
  if (!response.ok) {
    throw new Error(`NGA request failed: ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return new TextDecoder('gb18030').decode(buffer)
}

function parseNgaThreadList(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || []
  const posts = []
  const seen = new Set()

  for (const row of rows) {
    const tid = extractTid(row)
    if (!tid || seen.has(tid)) continue

    const title = stripHtml(extractTitle(row, tid))
    if (!title || title.includes('版务') || title.includes('公告')) continue

    const replies = extractReplies(row)
    const author = stripHtml(matchFirst(row, /class=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || '')
    const lastPost = extractLastPost(row)
    posts.push({
      title,
      tid,
      link: `https://bbs.nga.cn/read.php?tid=${tid}`,
      replies,
      author: author || '匿名用户',
      lastPost,
    })
    seen.add(tid)
  }

  return posts.sort((a, b) => b.replies - a.replies)
}

function extractTid(row) {
  const value =
    matchFirst(row, /read\.php\?tid=(\d+)/i) ||
    matchFirst(row, /tid[=:](\d+)/i) ||
    matchFirst(row, /data-tid=["']?(\d+)/i)
  return value ? Number(value) : 0
}

function extractTitle(row, tid) {
  const anchors = Array.from(
    row.matchAll(/<a\b([^>]*)href=["'][^"']*read\.php\?tid=(\d+)[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi)
  )
  const candidates = anchors
    .filter((anchor) => Number(anchor[2]) === tid)
    .map((anchor) => {
      const attrs = `${anchor[1]} ${anchor[3]}`
      const className = getAttr(attrs, 'class')
      const attrTitle = getAttr(attrs, 'title')
      const text = stripHtml(anchor[4])
      const title = stripHtml(attrTitle || text)
      return {
        title,
        className,
        score: scoreTitleCandidate(title, className),
      }
    })
    .filter((candidate) => candidate.score > 0)

  return candidates.sort((a, b) => b.score - a.score || b.title.length - a.title.length)[0]?.title || ''
}

function scoreTitleCandidate(title, className) {
  if (!title || /^\d+$/.test(title)) return 0
  if (/^(回复|查看|最后发表|上一页|下一页)$/i.test(title)) return 0
  if (/(?:reply|replies|count|author|lastpost|last_post)/i.test(className)) return 0

  let score = title.length
  if (/(?:topic|subject|title)/i.test(className)) score += 1000
  if (/[\u4e00-\u9fa5A-Za-z]/.test(title)) score += 100
  return score
}

function getAttr(attrs, name) {
  return decodeEntities(matchFirst(attrs, new RegExp(`${name}=["']([^"']*)["']`, 'i')))
}

function extractReplies(row) {
  const value =
    matchFirst(row, /回复[^\d]*(\d+)/i) ||
    matchFirst(row, /class=["'][^"']*replies[^"']*["'][^>]*>\s*(\d+)/i) ||
    matchFirst(row, /<a[^>]*>\s*(\d+)\s*<\/a>\s*<\/td>/i)
  return value ? Number(value) : 0
}

function extractLastPost(row) {
  const timestamp = matchFirst(row, /(?:lastpost|last_post|lastposttime)[^0-9]*(\d{10})/i)
  if (timestamp) return Number(timestamp)
  const timeText = stripHtml(matchFirst(row, /class=["'][^"']*lastpost[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || '')
  return parseRelativeChineseTime(timeText)
}

function parseRelativeChineseTime(text) {
  const now = Math.floor(Date.now() / 1000)
  const minute = matchFirst(text, /(\d+)\s*分钟前/)
  if (minute) return now - Number(minute) * 60
  const hour = matchFirst(text, /(\d+)\s*小时前/)
  if (hour) return now - Number(hour) * 3600
  return now
}

function matchFirst(input, regex) {
  return regex.exec(input)?.[1] || ''
}

function stripHtml(input) {
  return decodeEntities(String(input).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(input) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

async function readPreviousPayload() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'))
  } catch {
    return null
  }
}

main().catch(async (error) => {
  const previousPayload = await readPreviousPayload()
  const previousPosts = previousPayload?.posts || previousPayload?.data || []
  const hasPreviousPosts = Array.isArray(previousPosts) && previousPosts.length > 0
  const payload = {
    success: false,
    source: forumUrl,
    lastUpdated: hasPreviousPosts ? previousPayload.lastUpdated || previousPayload.updatedAt || '' : new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    count: hasPreviousPosts ? previousPosts.length : 0,
    posts: hasPreviousPosts ? previousPosts : [],
    data: hasPreviousPosts ? previousPosts : [],
    stale: hasPreviousPosts,
    lastError: error instanceof Error ? error.message : String(error),
  }
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(error)
  process.exitCode = 1
})
