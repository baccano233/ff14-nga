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
  const explicitTimestamp = matchFirst(row, /(?:lastpost|last_post|lastposttime|lastmodify|postdate)[^0-9]*(\d{10})/i)
  if (explicitTimestamp) return Number(explicitTimestamp)

  const lastPostCell = matchFirst(row, /<td[^>]+class=["'][^"']*(?:lastpost|last_post|c5)[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)
  const textTimestamp = parseChineseTime(stripHtml(lastPostCell || row))
  if (textTimestamp) return textTimestamp

  const timestamps = Array.from(row.matchAll(/\b(1[0-9]{9}|2[0-9]{9})\b/g))
    .map((match) => Number(match[1]))
    .filter((value) => value > 946684800 && value < 4102444800)
  return timestamps.length ? Math.max(...timestamps) : 0
}

function parseChineseTime(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  const now = Math.floor(Date.now() / 1000)
  const minute = matchFirst(normalized, /(\d+)\s*分钟前/)
  if (minute) return now - Number(minute) * 60
  if (/半小时前/.test(normalized)) return now - 30 * 60
  const hour = matchFirst(normalized, /(\d+)\s*小时前/)
  if (hour) return now - Number(hour) * 3600
  const day = matchFirst(normalized, /(\d+)\s*天前/)
  if (day) return now - Number(day) * 86400

  const absolute = parseDateTime(normalized, /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?\s+(\d{1,2}):(\d{2})/)
  if (absolute) return absolute

  const currentYear = new Date().getFullYear()
  const monthDay = parseDateTime(normalized, /(\d{1,2})[-/月.](\d{1,2})日?\s+(\d{1,2}):(\d{2})/, currentYear)
  if (monthDay) return monthDay

  const todayTime = parseDayTime(normalized, /今天\s*(\d{1,2}):(\d{2})/, 0)
  if (todayTime) return todayTime
  const yesterdayTime = parseDayTime(normalized, /昨天\s*(\d{1,2}):(\d{2})/, 1)
  if (yesterdayTime) return yesterdayTime
  const beforeYesterdayTime = parseDayTime(normalized, /前天\s*(\d{1,2}):(\d{2})/, 2)
  if (beforeYesterdayTime) return beforeYesterdayTime
  return 0
}

function parseDateTime(text, regex, fallbackYear) {
  const match = regex.exec(text)
  if (!match) return 0
  const hasYear = match.length === 6
  const year = hasYear ? Number(match[1]) : Number(fallbackYear)
  const month = Number(match[hasYear ? 2 : 1])
  const day = Number(match[hasYear ? 3 : 2])
  const hour = Number(match[hasYear ? 4 : 3])
  const minute = Number(match[hasYear ? 5 : 4])
  const date = new Date(year, month - 1, day, hour, minute)
  return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000)
}

function parseDayTime(text, regex, daysAgo) {
  const match = regex.exec(text)
  if (!match) return 0
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return Math.floor(date.getTime() / 1000)
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
