import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { jsPDF } from 'jspdf'

type Profile = {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  location: string | null
  blog: string | null
  twitter_username: string | null
  followers: number
  following: number
  public_repos: number
}

type Repo = {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  fork: boolean
  updated_at: string
}

type Portfolio = {
  profile: Profile
  readmeHtml: string | null
  repos: Repo[]
}

type KnowledgeBase = {
  username: string
  skills: string[]
  repos: {
    name: string
    description: string | null
    readme: string | null
    language: string | null
    topics: string[]
  }[]
}

class RateLimitError extends Error {
  resetAt: number
  constructor(message: string, resetAt: number) {
    super(message)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

const API_BASE = 'https://api.github.com'
const REPO_SORTS = [
  { id: 'stars', label: 'Stars' },
  { id: 'updated', label: 'Activity' },
  { id: 'forks', label: 'Forks' }
] as const

type RepoSort = (typeof REPO_SORTS)[number]

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const normalizeUrl = (value: string | null) => {
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `https://${value}`
}

const buildSummary = (profile: Profile, repos: Repo[]) => {
  const totalRepos = repos.length
  const languages = repos
    .filter((repo) => repo.language)
    .map((repo) => repo.language as string)
  const languageCounts = languages.reduce<Record<string, number>>((acc, lang) => {
    acc[lang] = (acc[lang] ?? 0) + 1
    return acc
  }, {})
  const topLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang)

  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0)
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0)
  const recentRepo = repos
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  const lines: string[] = []
  const name = profile.name ?? profile.login
  lines.push(`${name} is a GitHub creator with ${profile.followers} followers.`)
  if (totalRepos > 0) {
    lines.push(
      `Public repos shown: ${totalRepos}, with ${totalStars} total stars and ${totalForks} forks.`
    )
  }
  if (topLanguages.length > 0) {
    lines.push(`Most common languages: ${topLanguages.join(', ')}.`)
  }
  if (recentRepo) {
    lines.push(
      `Latest update: ${recentRepo.name} on ${formatDate(recentRepo.updated_at)}.`
    )
  }
  if (profile.bio) {
    lines.push(`Bio signal: "${profile.bio}".`)
  }

  const suggestions: string[] = []
  if (!profile.bio) {
    suggestions.push('Add a short bio to clarify focus.')
  }
  if (!profile.blog) {
    suggestions.push('Add a website or portfolio link.')
  }
  if (totalStars < 5 && totalRepos > 3) {
    suggestions.push('Pin or showcase one standout project to drive attention.')
  }
  if (topLanguages.length > 1) {
    suggestions.push('Consider a spotlight repo per language to show breadth.')
  }

  return { lines, suggestions }
}

const extractKeywords = (text: string) => {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'into',
    'your',
    'you',
    'about',
    'using',
    'uses',
    'used',
    'use',
    'project',
    'projects',
    'build',
    'built',
    'create',
    'creating',
    'app',
    'apps',
    'repo',
    'repository'
  ])
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stop.has(token))
  return Array.from(new Set(tokens))
}

const buildKnowledgeBase = async (
  username: string,
  repos: Repo[]
): Promise<KnowledgeBase> => {
  const targets = repos.slice()

  const readmes = await Promise.all(
    targets.map(async (repo) => {
      const readme = await fetchGitHubText(
        `${API_BASE}/repos/${repo.full_name}/readme`,
        {
          headers: {
            Accept: 'application/vnd.github.v3.raw'
          }
        },
        { allowNotFound: true }
      )
      return readme
    })
  )

  const repoData = targets.map((repo, index) => ({
    name: repo.name,
    description: repo.description,
    readme: readmes[index],
    language: repo.language,
    topics: []
  }))

  const skillSet = new Set<string>()
  repoData.forEach((repo) => {
    if (repo.language) skillSet.add(repo.language)
    if (repo.description) {
      extractKeywords(repo.description).forEach((keyword) => skillSet.add(keyword))
    }
    if (repo.readme) {
      extractKeywords(repo.readme).slice(0, 40).forEach((keyword) => skillSet.add(keyword))
    }
  })

  return {
    username,
    skills: Array.from(skillSet).slice(0, 60),
    repos: repoData
  }
}

const buildMockResponse = (kb: KnowledgeBase | null, input: string) => {
  if (!kb) {
    return 'Knowledge base is still loading. Try again in a moment.'
  }
  const query = input.toLowerCase()
  const queryTerms = extractKeywords(query)
  if (queryTerms.length === 0) {
    return 'Ask about specific skills, tools, or repo topics.'
  }

  const skillMatches = kb.skills.filter((skill) => query.includes(skill.toLowerCase()))
  const repoMatches = kb.repos.filter((repo) => {
    const haystack = `${repo.name} ${repo.description ?? ''} ${repo.readme ?? ''}`.toLowerCase()
    return queryTerms.some((term) => haystack.includes(term))
  })

  if (repoMatches.length > 0) {
    const names = repoMatches.slice(0, 3).map((repo) => repo.name)
    return `Yes — I found relevant signals in ${names.join(
      ', '
    )}. Ask me to summarize a specific repo.`
  }

  if (skillMatches.length > 0) {
    return `Likely experience with ${skillMatches.slice(0, 5).join(', ')} based on repo metadata and README content.`
  }

  return 'No strong signals yet. Try asking about a specific language, framework, or repo name.'
}

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const parseRateLimit = (res: Response, bodyMessage?: string) => {
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  const resetAt = reset ? Number(reset) * 1000 : Date.now() + 15 * 60 * 1000
  if (res.status === 403 && (remaining === '0' || bodyMessage?.includes('rate limit'))) {
    throw new RateLimitError(
      'GitHub is taking a breather! ☕ Rate limit reached.',
      resetAt
    )
  }
}

const fetchGitHubJson = async <T,>(
  url: string,
  init?: RequestInit,
  options?: { allowNotFound?: boolean }
): Promise<T | null> => {
  const res = await fetch(url, init)
  let body: { message?: string } | null = null
  try {
    body = (await res.json()) as { message?: string }
  } catch {
    body = null
  }
  parseRateLimit(res, body?.message)
  if (!res.ok) {
    if (options?.allowNotFound && res.status === 404) return null
    const message = body?.message ?? 'Unable to load data. Try again in a moment.'
    throw new Error(message)
  }
  return body as T
}

const fetchGitHubText = async (
  url: string,
  init?: RequestInit,
  options?: { allowNotFound?: boolean }
): Promise<string | null> => {
  const res = await fetch(url, init)
  let message = ''
  if (!res.ok) {
    try {
      const data = (await res.json()) as { message?: string }
      message = data?.message ?? ''
    } catch {
      message = ''
    }
  }
  parseRateLimit(res, message)
  if (!res.ok) {
    if (options?.allowNotFound && res.status === 404) return null
    throw new Error(message || 'Unable to load data. Try again in a moment.')
  }
  return res.text()
}

type RateLimitStatus = {
  remaining: number
  limit: number
  resetAt: number
}

const RateLimitStatus = ({
  status,
  now
}: {
  status: RateLimitStatus | null
  now: number
}) => {
  if (!status) return null
  const isLimited = status.remaining === 0
  return (
    <div className={`rate-limit ${isLimited ? 'is-limited' : ''}`}>
      <span>
        {status.remaining}/{status.limit} requests left
      </span>
      {isLimited && (
        <span className="countdown">
          Resets in {formatCountdown(status.resetAt - now)}
        </span>
      )}
    </div>
  )
}

export default function App() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [lastSearched, setLastSearched] = useState<string | null>(null)
  const [repoSort, setRepoSort] = useState<RepoSort>(REPO_SORTS[0])
  const [shareBusy, setShareBusy] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [rateLimitReset, setRateLimitReset] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [rateStatus, setRateStatus] = useState<RateLimitStatus | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [kbLoading, setKbLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [botOpen, setBotOpen] = useState(false)
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'bot'; content: string }[]
  >([
    {
      id: 'welcome',
      role: 'bot',
      content:
        "Recruiter bot online. Ask me about skills, tools, or specific repositories."
    }
  ])
  const [deepScanEnabled, setDeepScanEnabled] = useState(true)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const shareRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)

  const canSearch = username.trim().length > 1
  const rateLimited = rateLimitReset !== null && now < rateLimitReset
  const hasReadme = Boolean(portfolio?.readmeHtml)
  const graphCells = useMemo(() => Array.from({ length: 56 }, (_, i) => i), [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (filterOpen && filterRef.current && !filterRef.current.contains(target)) {
        setFilterOpen(false)
      }
      if (shareOpen && shareRef.current && !shareRef.current.contains(target)) {
        setShareOpen(false)
      }
      if (botOpen && modalRef.current && !modalRef.current.contains(target)) {
        setBotOpen(false)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterOpen(false)
        setShareOpen(false)
        setBotOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [filterOpen, shareOpen, botOpen])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (event: MouseEvent) => {
      if (!dragOffset.current) return
      setModalPos({
        x: event.clientX - dragOffset.current.x,
        y: event.clientY - dragOffset.current.y
      })
    }
    const handleUp = () => {
      setDragging(false)
      dragOffset.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  useEffect(() => {
    if (!rateLimitReset && rateStatus?.remaining !== 0) return
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (rateLimitReset && current >= rateLimitReset) {
        setRateLimitReset(null)
      }
      if (rateStatus && rateStatus.remaining === 0 && current >= rateStatus.resetAt) {
        setRateStatus((prev) => (prev ? { ...prev, remaining: prev.limit } : prev))
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [rateLimitReset, rateStatus])

  useEffect(() => {
    let cancelled = false
    const loadRateLimit = async () => {
      try {
        const data = await fetchGitHubJson<{
          resources?: { core?: { remaining: number; limit: number; reset: number } }
        }>(`${API_BASE}/rate_limit`)
        const core = data?.resources?.core
        if (!core || cancelled) return
        setRateStatus({
          remaining: core.remaining,
          limit: core.limit,
          resetAt: core.reset * 1000
        })
        if (core.remaining === 0) {
          setRateLimitReset(core.reset * 1000)
        }
      } catch {
        // ignore rate limit fetch errors
      }
    }

    loadRateLimit()
    const id = window.setInterval(loadRateLimit, 60000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (rateLimited) return
    const handle = username.trim()
    if (!handle) return

    setLoading(true)
    setError(null)
    setPortfolio(null)
    setLastSearched(handle)
    setRepoSort(REPO_SORTS[0])
    setFilterOpen(false)
    setShareOpen(false)
    setRateLimitReset(null)
    setKnowledgeBase(null)
    setBotOpen(false)
    setModalPos(null)
    setMessages([
      {
        id: 'welcome',
        role: 'bot',
        content:
          "Recruiter bot online. Ask me about skills, tools, or specific repositories."
      }
    ])
    setDeepScanEnabled(true)

    try {
      const profile = (await fetchGitHubJson<Profile>(`${API_BASE}/users/${handle}`)) as Profile
      if (!profile) {
        throw new Error(`No GitHub user found for "${handle}".`)
      }

      const repos = (await fetchGitHubJson<Repo[]>(
        `${API_BASE}/users/${handle}/repos?per_page=100&sort=updated`
      )) as Repo[]
      const nonForks = repos.filter((repo) => !repo.fork)

      const readmeHtml = await fetchGitHubText(
        `${API_BASE}/repos/${handle}/${handle}/readme`,
        {
          headers: {
            Accept: 'application/vnd.github.v3.html'
          }
        },
        { allowNotFound: true }
      )

      setPortfolio({
        profile,
        readmeHtml,
        repos: nonForks.length > 0 ? nonForks : repos
      })
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRateLimitReset(err.resetAt)
        const resetTime = new Date(err.resetAt).toLocaleTimeString()
        setError(`${err.message} Please try again after ${resetTime}.`)
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    } finally {
      setLoading(false)
    }
  }

  const profileLinks = useMemo(() => {
    if (!portfolio) return []
    const blog = normalizeUrl(portfolio.profile.blog)
    return [
      { label: 'GitHub', href: portfolio.profile.html_url },
      blog ? { label: 'Website', href: blog } : null,
      portfolio.profile.twitter_username
        ? {
            label: 'Twitter',
            href: `https://twitter.com/${portfolio.profile.twitter_username}`
          }
        : null
    ].filter(Boolean) as { label: string; href: string }[]
  }, [portfolio])

  const repoCandidates = useMemo(() => {
    if (!portfolio) return []
    return portfolio.repos
  }, [portfolio])

  const summary = useMemo(() => {
    if (!portfolio) return null
    return buildSummary(portfolio.profile, repoCandidates)
  }, [portfolio, repoCandidates])

  const visibleRepos = useMemo(() => {
    if (!repoCandidates.length) return []
    const sorted = repoCandidates.slice().sort((a, b) => {
      if (repoSort.id === 'stars') {
        return b.stargazers_count - a.stargazers_count
      }
      if (repoSort.id === 'updated') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
      if (repoSort.id === 'forks') {
        return b.forks_count - a.forks_count
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return sorted.slice(0, 3)
  }, [repoCandidates, repoSort])

  useEffect(() => {
    if (!portfolio) return
    let cancelled = false
    const loadKB = async () => {
      setKbLoading(true)
      try {
        const sourceRepos = deepScanEnabled
          ? portfolio.repos
          : portfolio.repos
              .slice()
              .sort((a, b) => b.stargazers_count - a.stargazers_count)
              .slice(0, 10)
        const kb = await buildKnowledgeBase(portfolio.profile.login, sourceRepos)
        if (!cancelled) {
          setKnowledgeBase(kb)
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          setRateLimitReset(err.resetAt)
        }
      } finally {
        if (!cancelled) setKbLoading(false)
      }
    }
    loadKB()
    return () => {
      cancelled = true
    }
  }, [portfolio, deepScanEnabled])

  const getInlineStyles = async () => {
    let css = ''
    document.querySelectorAll('style').forEach((style) => {
      css += `${style.textContent ?? ''}\n`
    })

    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    for (const link of links) {
      const href = link.getAttribute('href')
      if (!href) continue
      try {
        const res = await fetch(href)
        if (res.ok) {
          css += `${await res.text()}\n`
        }
      } catch {
        // Ignore stylesheet fetch failures
      }
    }
    return css
  }

  const downloadImage = async () => {
    if (!portfolio) return
    const target = document.getElementById('portfolio-result')
    if (!target) return
    setShareBusy(true)
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#0f0f14',
        scale: 2
      })
      canvas.toBlob((blob) => {
        if (blob) saveAs(blob, 'portfolio-snapshot.png')
      })
    } finally {
      setShareBusy(false)
    }
  }

  const downloadZip = async () => {
    if (!portfolio) return
    setShareBusy(true)
    try {
      const css = await getInlineStyles()
      const data = {
        profile: portfolio.profile,
        repos: visibleRepos,
        readmeHtml: portfolio.readmeHtml,
        username: lastSearched,
        repoSort: repoSort.label,
        knowledgeBase
      }
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${data.profile.login} • GitHub Portfolio</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div class="page">
      <section id="portfolio-result" class="grid"></section>
    </div>
    <script>
      const data = ${JSON.stringify(data)};
      const escapeHtml = (value) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const profile = data.profile;
      const repos = data.repos || [];
      const about = data.readmeHtml || '<p class="muted">No profile README found.</p>';
      const kb = data.knowledgeBase;
      const links = [
        { label: 'GitHub', href: profile.html_url },
        profile.blog ? { label: 'Website', href: profile.blog.startsWith('http') ? profile.blog : 'https://' + profile.blog } : null,
        profile.twitter_username ? { label: 'Twitter', href: 'https://twitter.com/' + profile.twitter_username } : null
      ].filter(Boolean);
      const linkHtml = links.map((link) => '<a href="' + link.href + '" target="_blank" rel="noreferrer">' + link.label + '</a>').join('');
      const repoHtml = repos.map((repo) => {
        return \`
          <div class="repo-card">
            <div class="repo-title">
              <a href="\${repo.html_url}" target="_blank" rel="noreferrer">\${escapeHtml(repo.name)}</a>
              <span class="stars">★ \${repo.stargazers_count}</span>
            </div>
            <p class="muted">\${escapeHtml(repo.description || 'No description available yet.')}</p>
            <div class="repo-meta">
              \${repo.language ? '<span>' + escapeHtml(repo.language) + '</span>' : ''}
              <span>Updated \${new Date(repo.updated_at).toLocaleDateString()}</span>
              \${repo.homepage ? '<a href="' + repo.homepage + '" target="_blank" rel="noreferrer">Live demo</a>' : ''}
            </div>
          </div>
        \`;
      }).join('');
      const target = document.getElementById('portfolio-result');
      target.innerHTML = \`
        <article class="panel profile">
          <div class="profile-header">
            <img src="\${profile.avatar_url}" alt="\${profile.login}" />
            <div>
              <h2>\${escapeHtml(profile.name || profile.login)}</h2>
              <p class="muted">@\${escapeHtml(profile.login)}</p>
              \${profile.bio ? '<p>' + escapeHtml(profile.bio) + '</p>' : ''}
            </div>
          </div>
          <div class="stats">
            <div><span class="stat-value">\${profile.followers}</span><span class="stat-label">Followers</span></div>
            <div><span class="stat-value">\${profile.following}</span><span class="stat-label">Following</span></div>
            <div><span class="stat-value">\${profile.public_repos}</span><span class="stat-label">Public repos</span></div>
          </div>
          <div class="meta">
            \${profile.location ? '<span>' + escapeHtml(profile.location) + '</span>' : ''}
            \${linkHtml}
          </div>
        </article>
        <article class="panel about">
          <div class="panel-header">
            <div>
              <h3>About</h3>
              \${data.username ? '<span class="muted">@' + escapeHtml(data.username) + '</span>' : ''}
            </div>
          </div>
          <div class="about-body is-expanded">\${about}</div>
        </article>
        <article class="panel repos">
          <div class="panel-header">
            <div>
              <h3>Top repositories</h3>
              <span class="muted">\${escapeHtml(data.repoSort)}</span>
            </div>
          </div>
          <div class="repo-list">\${repoHtml}</div>
        </article>
        <article class="panel terminal">
          <div class="panel-header">
            <div>
              <h3>Recruiter Terminal</h3>
              <span class="muted">Static export (mock responses)</span>
            </div>
          </div>
          <div class="terminal-shell">
            <div class="terminal-line">kb.skills: \${kb ? kb.skills.length : 0}</div>
            <div class="terminal-line">kb.repos: \${kb ? kb.repos.length : 0}</div>
            <div class="terminal-line">Ask interactive questions in the live app.</div>
          </div>
        </article>
      \`;
    </script>
  </body>
</html>`

      const zip = new JSZip()
      zip.file('index.html', html)
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, 'my-github-portfolio.zip')
    } finally {
      setShareBusy(false)
    }
  }

  const downloadPdf = async () => {
    if (!portfolio) return
    const profileEl = document.querySelector('[data-export="profile"]') as HTMLElement | null
    const reposEl = document.querySelector('[data-export="repos"]') as HTMLElement | null
    if (!profileEl || !reposEl) return

    setShareBusy(true)
    document.body.classList.add('pdf-export')
    try {
      const pdf = new jsPDF('p', 'pt', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const renderSection = async (el: HTMLElement, yOffset: number) => {
        const canvas = await html2canvas(el, {
          backgroundColor: '#0f0f14',
          scale: 2
        })
        const imgData = canvas.toDataURL('image/png')
        const imgWidth = pageWidth - 48
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        pdf.addImage(imgData, 'PNG', 24, yOffset, imgWidth, imgHeight)
        return yOffset + imgHeight + 16
      }

      let currentY = 24
      currentY = await renderSection(profileEl, currentY)
      if (currentY > pageHeight - 200) {
        pdf.addPage()
        currentY = 24
      }
      await renderSection(reposEl, currentY)
      pdf.save('portfolio-summary.pdf')
    } finally {
      document.body.classList.remove('pdf-export')
      setShareBusy(false)
    }
  }

  return (
    <div className="page">
      {portfolio && (
        <div className="top-actions" ref={shareRef}>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShareOpen((prev) => !prev)}
          >
            <span>Share profile</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M16 5l3 3-3 3M19 8H9a4 4 0 0 0-4 4v7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {shareOpen && (
            <div className="menu">
              <button type="button" onClick={downloadZip} disabled={shareBusy}>
                Download ZIP
              </button>
              <button type="button" onClick={downloadPdf} disabled={shareBusy}>
                Save as PDF
              </button>
              <button type="button" onClick={downloadImage} disabled={shareBusy}>
                Save as Image
              </button>
            </div>
          )}
        </div>
      )}
      {rateLimited && (
        <div className="toast" role="status">
          <strong>GitHub is taking a breather! ☕</strong>
          <span>
            Rate limit reached. Please try again after{' '}
            {new Date(rateLimitReset).toLocaleTimeString()}.
          </span>
          <small>Retry in {formatCountdown(rateLimitReset - now)}</small>
        </div>
      )}
      <header className="hero">
        <div>
          <p className="eyebrow">GitHub Portfolio Creator</p>
          <h1>Turn a username into a sharp, shareable portfolio.</h1>
          <p className="subhead">
            Pull public GitHub data into a sleek portfolio: profile stats, README-based
            About, AI summary, top repos with filters, and an interactive recruiter
            terminal.
          </p>
          <RateLimitStatus status={rateStatus} now={now} />
        </div>
        <form className="search" onSubmit={handleSubmit}>
          <label htmlFor="username">GitHub username</label>
          <div className="search-row">
            <input
              id="username"
              type="text"
              placeholder="e.g. torvalds"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
            <button type="submit" disabled={!canSearch || loading || rateLimited}>
              {rateLimited
                ? `Retry in ${formatCountdown(rateLimitReset - now)}`
                : loading
                  ? 'Building…'
                  : 'Create Portfolio'}
            </button>
          </div>
          <p className="hint">No auth token needed. Public data only.</p>
        </form>
      </header>

      <main className="content">
        {error && (
          <div className="panel error">
            <strong>Request failed.</strong>
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="panel loading">
            <div className="pulse" />
            <div>
              <p className="loading-title">Crafting the portfolio</p>
              <p className="loading-sub">Pulling README and repo metadata…</p>
            </div>
          </div>
        )}

        {!loading && !portfolio && !error && (
          <div className="panel empty">
            <p>Enter a GitHub username to generate a portfolio preview.</p>
          </div>
        )}

        {portfolio && (
          <section className="grid" id="portfolio-result">
            <div className="column">
              <article className="card profile" data-export="profile">
                <div className="profile-header">
                  <img src={portfolio.profile.avatar_url} alt={portfolio.profile.login} />
                  <div>
                    <h2>{portfolio.profile.name ?? portfolio.profile.login}</h2>
                    <p className="muted">@{portfolio.profile.login}</p>
                    {portfolio.profile.bio && <p>{portfolio.profile.bio}</p>}
                  </div>
                </div>
                <div className="stats">
                  <div>
                    <span className="stat-value">{portfolio.profile.followers}</span>
                    <span className="stat-label">Followers</span>
                  </div>
                  <div>
                    <span className="stat-value">{portfolio.profile.following}</span>
                    <span className="stat-label">Following</span>
                  </div>
                  <div>
                    <span className="stat-value">{portfolio.profile.public_repos}</span>
                    <span className="stat-label">Public repos</span>
                  </div>
                </div>
                <div className="meta">
                  {portfolio.profile.location && (
                    <span>{portfolio.profile.location}</span>
                  )}
                  {profileLinks.map((link) => (
                    <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
                {summary && (
                  <div className="summary">
                    <p className="summary-title">AI Summary</p>
                    <ul>
                      {summary.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {summary.suggestions.length > 0 && (
                      <>
                        <p className="summary-title">Suggestions</p>
                        <ul>
                          {summary.suggestions.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="summary-note">
                      Based on public GitHub profile and repo metadata only.
                    </p>
                  </div>
                )}
              </article>

              <article className="card about">
                <div className="panel-header">
                  <div>
                    <h3>About</h3>
                    {lastSearched && <span className="muted">@{lastSearched}</span>}
                  </div>
                </div>
                {portfolio.readmeHtml ? (
                  <div
                    className="about-body is-expanded"
                    dangerouslySetInnerHTML={{ __html: portfolio.readmeHtml }}
                  />
                ) : (
                  <div className="about-fallback">
                    <p className="muted">
                      No profile README found. Add a README.md to the{' '}
                      <span className="mono">{portfolio.profile.login}</span> repository
                      to show a full About section.
                    </p>
                    {portfolio.profile.bio ? (
                      <p className="bio-extended">{portfolio.profile.bio}</p>
                    ) : (
                      <p className="muted">Add a short bio to highlight your focus.</p>
                    )}
                  </div>
                )}
              </article>

              {!hasReadme && (
                <article className="card repos" data-export="repos">
                  <div className="panel-header">
                    <div>
                      <h3>Top repositories</h3>
                      <span className="muted">{repoSort.label}</span>
                    </div>
                    <div className="repo-controls" ref={filterRef}>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setFilterOpen((prev) => !prev)}
                      >
                        <span>Filter</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 6h16M7 12h10M10 18h4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      {filterOpen && (
                        <div className="menu">
                          {REPO_SORTS.map((sort) => (
                            <button
                              key={sort.id}
                              type="button"
                              className={repoSort.id === sort.id ? 'is-active' : ''}
                              onClick={() => {
                                setRepoSort(sort)
                                setFilterOpen(false)
                              }}
                            >
                              {sort.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="repo-list">
                    {visibleRepos.map((repo) => (
                      <div className="repo-card" key={repo.id}>
                        <div className="repo-title">
                          <a href={repo.html_url} target="_blank" rel="noreferrer">
                            {repo.name}
                          </a>
                          <span className="stars">★ {repo.stargazers_count}</span>
                        </div>
                        <p className="muted">
                          {repo.description ?? 'No description available yet.'}
                        </p>
                        <div className="repo-meta">
                          {repo.language && <span>{repo.language}</span>}
                          <span>Updated {formatDate(repo.updated_at)}</span>
                          {repo.homepage && (
                            <a href={repo.homepage} target="_blank" rel="noreferrer">
                              Live demo
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {!hasReadme && (
                <article className="card graph">
                  <div className="panel-header">
                    <div>
                      <h3>Contribution Graph</h3>
                      <span className="muted">Preview placeholder</span>
                    </div>
                  </div>
                  <div className="graph-grid">
                    {graphCells.map((cell) => (
                      <span key={cell} className="graph-cell" />
                    ))}
                  </div>
                </article>
              )}
            </div>

            <div className="column">
              {hasReadme && (
                <article className="card repos" data-export="repos">
                  <div className="panel-header">
                    <div>
                      <h3>Top repositories</h3>
                      <span className="muted">{repoSort.label}</span>
                    </div>
                    <div className="repo-controls" ref={filterRef}>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setFilterOpen((prev) => !prev)}
                      >
                        <span>Filter</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 6h16M7 12h10M10 18h4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      {filterOpen && (
                        <div className="menu">
                          {REPO_SORTS.map((sort) => (
                            <button
                              key={sort.id}
                              type="button"
                              className={repoSort.id === sort.id ? 'is-active' : ''}
                              onClick={() => {
                                setRepoSort(sort)
                                setFilterOpen(false)
                              }}
                            >
                              {sort.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="repo-list">
                    {visibleRepos.map((repo) => (
                      <div className="repo-card" key={repo.id}>
                        <div className="repo-title">
                          <a href={repo.html_url} target="_blank" rel="noreferrer">
                            {repo.name}
                          </a>
                          <span className="stars">★ {repo.stargazers_count}</span>
                        </div>
                        <p className="muted">
                          {repo.description ?? 'No description available yet.'}
                        </p>
                        <div className="repo-meta">
                          {repo.language && <span>{repo.language}</span>}
                          <span>Updated {formatDate(repo.updated_at)}</span>
                          {repo.homepage && (
                            <a href={repo.homepage} target="_blank" rel="noreferrer">
                              Live demo
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </div>
          </section>
        )}
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setBotOpen(true)}
        aria-label="Open recruiter bot"
      >
        <span>Bot</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 9h10M7 13h6M12 3a7 7 0 0 1 7 7v5a3 3 0 0 1-3 3h-6l-3 3v-3a4 4 0 0 1-4-4v-4a7 7 0 0 1 7-7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {botOpen && (
        <div className="modal-overlay">
          <div
            className="modal"
            ref={modalRef}
            style={
              modalPos
                ? { transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }
                : undefined
            }
          >
            <div
              className="modal-header drag-handle"
              onMouseDown={(event) => {
                if (!modalRef.current) return
                const rect = modalRef.current.getBoundingClientRect()
                dragOffset.current = {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top
                }
                setDragging(true)
              }}
            >
              <div>
                <h3>Recruiter Terminal</h3>
                <span className="muted">
                  {kbLoading ? 'Building knowledge base…' : 'Mock AI ready'}
                </span>
              </div>
              <div className="modal-actions">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={deepScanEnabled}
                    onChange={(event) => setDeepScanEnabled(event.target.checked)}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-label">Deep Scan</span>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setBotOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="terminal-shell">
              <div className="terminal-line">
                {knowledgeBase
                  ? `Loaded ${knowledgeBase.skills.length} skills from ${knowledgeBase.repos.length} repos.`
                  : 'Initializing knowledge base...'}
              </div>
              {messages.map((message) => (
                <div key={message.id} className={`terminal-line ${message.role}`}>
                  <span className="prompt">
                    {message.role === 'user' ? 'you' : 'bot'}:
                  </span>
                  <span>{message.content}</span>
                </div>
              ))}
              <form
                className="terminal-input"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = chatInput.trim()
                  if (!value) return
                  const id = `${Date.now()}-${Math.random()}`
                  const response = buildMockResponse(knowledgeBase, value)
                  setMessages((prev) => [
                    ...prev,
                    { id, role: 'user', content: value },
                    { id: `${id}-bot`, role: 'bot', content: response }
                  ])
                  setChatInput('')
                }}
              >
                <span className="prompt">you:</span>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about WebSockets, APIs, React, etc."
                />
                <button type="submit" disabled={!knowledgeBase}>
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
