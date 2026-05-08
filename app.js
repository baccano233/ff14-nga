const DATA_URL = './data/ff14-hot.json'

const quickLinks = [
  { label: '官网', url: 'https://ff.web.sdo.com/' },
  { label: '活动', url: 'https://act.ff.web.sdo.com/' },
  { label: 'NGA', url: 'https://bbs.nga.cn/thread.php?fid=-362960' },
  { label: '灰机 Wiki', url: 'https://ff14.huijiwiki.com/wiki/%E9%A6%96%E9%A1%B5' },
  { label: 'Universalis', url: 'https://universalis.app/' },
]

const navGroups = [
  {
    title: '资料',
    links: [
      { label: '灰机 Wiki', desc: '任务、职业、道具资料', url: 'https://ff14.huijiwiki.com/wiki/%E9%A6%96%E9%A1%B5' },
      { label: 'Garland Tools', desc: '采集制作与物品数据库', url: 'https://garlandtools.org/' },
      { label: 'Eorzea Database', desc: '国际服官方数据库', url: 'https://na.finalfantasyxiv.com/lodestone/playguide/db/' },
    ],
  },
  {
    title: '社区',
    links: [
      { label: 'NGA FF14', desc: '国服玩家讨论板块', url: 'https://bbs.nga.cn/thread.php?fid=-362960' },
      { label: 'The Lodestone', desc: '角色、新闻、社群信息', url: 'https://na.finalfantasyxiv.com/lodestone/' },
      { label: 'Reddit', desc: '海外社区讨论', url: 'https://www.reddit.com/r/ffxiv/' },
    ],
  },
  {
    title: '交易',
    links: [
      { label: 'Universalis', desc: '市场板价格查询', url: 'https://universalis.app/' },
      { label: 'Saddlebag Exchange', desc: '跨服交易参考', url: 'https://saddlebagexchange.com/' },
      { label: 'Teamcraft', desc: '制作清单与宏工具', url: 'https://ffxivteamcraft.com/' },
    ],
  },
]

const toolLinks = [
  { label: '配装模拟', url: 'https://etro.gg/' },
  { label: '副本时间轴', url: 'https://ffxiv.tuufless.com/' },
  { label: '钓鱼时钟', url: 'https://ff14fish.carbuncleplushy.com/' },
  { label: '制作工具', url: 'https://ffxivteamcraft.com/' },
]

const fallbackPosts = [
  {
    title: '7.0 新人入坑职业推荐集中讨论',
    tid: 10000001,
    link: 'https://bbs.nga.cn/thread.php?fid=-362960',
    replies: 128,
    author: '水晶塔观察员',
    lastPost: Math.floor(Date.now() / 1000) - 980,
  },
  {
    title: '本周零式野队机制复盘与宏整理',
    tid: 10000002,
    link: 'https://bbs.nga.cn/thread.php?fid=-362960',
    replies: 96,
    author: '黑魔法社',
    lastPost: Math.floor(Date.now() / 1000) - 1880,
  },
  {
    title: '绝本开荒固定队招募与经验交流',
    tid: 10000003,
    link: 'https://bbs.nga.cn/thread.php?fid=-362960',
    replies: 64,
    author: '猫魅骑士',
    lastPost: Math.floor(Date.now() / 1000) - 3200,
  },
]

const state = {
  posts: [],
  sort: 'hot',
  keyword: '',
  updatedAt: '',
}

const postList = document.querySelector('#postList')
const postCount = document.querySelector('#postCount')
const statusBadge = document.querySelector('#statusBadge')
const updatedAt = document.querySelector('#updatedAt')
const keywordInput = document.querySelector('#keywordInput')
const sortButtons = Array.from(document.querySelectorAll('[data-sort]'))
const webSearchForm = document.querySelector('#webSearchForm')
const webSearchInput = document.querySelector('#webSearchInput')
const quickLinksContainer = document.querySelector('#quickLinks')
const navGroupsContainer = document.querySelector('#navGroups')
const toolLinksContainer = document.querySelector('#toolLinks')

webSearchForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const keyword = webSearchInput.value.trim()
  if (!keyword) return
  window.open(`https://www.google.com/search?q=${encodeURIComponent(`${keyword} FF14`)}`, '_blank', 'noreferrer')
})

keywordInput.addEventListener('input', (event) => {
  state.keyword = event.target.value.trim().toLowerCase()
  render()
})

sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.sort = button.dataset.sort
    sortButtons.forEach((item) => item.classList.toggle('is-active', item === button))
    render()
  })
})

async function bootstrap() {
  renderHomeLinks()
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const posts = normalizePosts(payload.posts || payload.data || [])
    if (!posts.length && payload.success === false) {
      throw new Error(payload.lastError || 'empty failed cache')
    }
    state.posts = posts
    state.updatedAt = payload.lastUpdated || payload.updatedAt || ''
    statusBadge.textContent = payload.success === false ? '缓存异常 · 旧数据' : '缓存数据'
  } catch (error) {
    console.warn('[FF14Hot] use fallback posts', error)
    state.posts = fallbackPosts
    state.updatedAt = new Date().toISOString()
    statusBadge.textContent = '示例数据'
  }
  updatedAt.textContent = formatUpdatedAt(state.updatedAt)
  render()
}

function renderHomeLinks() {
  quickLinksContainer.innerHTML = quickLinks
    .map(
      (link) => `
        <a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
      `
    )
    .join('')

  navGroupsContainer.innerHTML = navGroups
    .map(
      (group) => `
        <article class="nav-group">
          <h3>${escapeHtml(group.title)}</h3>
          <div class="nav-link-list">
            ${group.links
              .map(
                (link) => `
                  <a class="nav-link" href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">
                    <span>${escapeHtml(link.label)}</span>
                    <small>${escapeHtml(link.desc)}</small>
                  </a>
                `
              )
              .join('')}
          </div>
        </article>
      `
    )
    .join('')

  toolLinksContainer.innerHTML = toolLinks
    .map(
      (link) => `
        <a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
      `
    )
    .join('')
}

function normalizePosts(posts) {
  return posts
    .map((post) => ({
      title: String(post.title || '').trim(),
      tid: Number(post.tid || 0),
      link: String(post.link || (post.tid ? `https://bbs.nga.cn/read.php?tid=${post.tid}` : 'https://bbs.nga.cn')),
      replies: Number(post.replies || post.reply || 0),
      author: String(post.author || '匿名用户'),
      lastPost: Number(post.lastPost || post.last_post || post.lastpost || 0),
    }))
    .filter((post) => post.title && post.link)
}

function getVisiblePosts() {
  const keyword = state.keyword
  const filtered = keyword
    ? state.posts.filter((post) =>
        [post.title, post.author, String(post.tid)].some((value) => value.toLowerCase().includes(keyword))
      )
    : [...state.posts]

  return filtered.sort((a, b) => {
    if (state.sort === 'latest') return b.lastPost - a.lastPost
    return b.replies - a.replies
  })
}

function render() {
  const posts = getVisiblePosts()
  postCount.textContent = `${posts.length} 条`
  if (!posts.length) {
    postList.innerHTML = `<div class="empty-state">${state.keyword ? '没有匹配的帖子' : '暂无可展示帖子'}</div>`
    return
  }

  postList.innerHTML = posts
    .map(
      (post, index) => `
        <a class="post-card" href="${escapeAttr(post.link)}" target="_blank" rel="noreferrer" title="${escapeAttr(
          post.title
        )}" aria-label="${escapeAttr(post.title)}">
          <span class="post-rank">${String(index + 1).padStart(2, '0')}</span>
          <span class="post-main">
            <span class="post-title">${escapeHtml(post.title)}</span>
            <span class="post-meta">
              <span>TID ${post.tid || '-'}</span>
              <span>${escapeHtml(post.author)}</span>
              <span>${formatRelativeTime(post.lastPost)}</span>
            </span>
          </span>
          <span class="post-replies">${post.replies} 回复</span>
          <span class="post-tooltip" role="tooltip">${escapeHtml(post.title)}</span>
        </a>
      `
    )
    .join('')
}

function formatUpdatedAt(value) {
  if (!value) return '更新时间：--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '更新时间：--'
  return `更新于 ${date.toLocaleString('zh-CN', { hour12: false })}`
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '回复时间未知'
  const ms = timestamp > 100000000000 ? timestamp : timestamp * 1000
  const diff = Math.max(0, Date.now() - ms)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  return new Date(ms).toLocaleDateString('zh-CN')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;')
}

bootstrap()
