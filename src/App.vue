<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { attractions, audienceOptions, categoryOptions, regions } from './data/attractions'

const routeHash = ref(window.location.hash || '#/')
const keyword = ref('')
const selectedRegions = ref([])
const selectedAudiences = ref([])
const selectedCategories = ref([])
const sortBy = ref('popular')
const authError = ref('')
const authMessage = ref('')
const heroIndex = ref(0)
const loginForm = ref({ email: '', password: '' })
const registerForm = ref({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  accepted: false
})
const currentUser = ref(loadCurrentUser())
const favorites = ref(loadFavorites())
let heroTimer

onMounted(() => {
  window.addEventListener('hashchange', handleHashChange)
  heroTimer = window.setInterval(showNextHero, 5000)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', handleHashChange)
  window.clearInterval(heroTimer)
})

const currentPath = computed(() => routeHash.value.replace(/^#/, '') || '/')
const detailId = computed(() => currentPath.value.match(/^\/attractions\/([^/]+)$/)?.[1] || '')
const selectedAttraction = computed(() => attractions.find((item) => item.id === detailId.value))

const routeName = computed(() => {
  if (currentPath.value === '/' || currentPath.value === '/attractions') return 'home'
  if (currentPath.value === '/login') return 'login'
  if (currentPath.value === '/register') return 'register'
  if (currentPath.value === '/profile') return 'profile'
  if (detailId.value) return selectedAttraction.value ? 'detail' : 'missing'
  return 'missing'
})

const filteredAttractions = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  const result = attractions.filter((item) => {
    const searchable = [
      item.name,
      item.region,
      item.province,
      item.city,
      item.summary,
      ...item.categories,
      ...item.audienceTags
    ]
      .join(' ')
      .toLowerCase()

    const matchesKeyword = !text || searchable.includes(text)
    const matchesRegion = selectedRegions.value.length === 0 || selectedRegions.value.includes(item.region)
    const matchesCategory =
      selectedCategories.value.length === 0 ||
      selectedCategories.value.some((category) => item.categories.includes(category))
    const matchesAudience =
      selectedAudiences.value.length === 0 ||
      selectedAudiences.value.some((audience) => item.audienceTags.includes(audience))

    return matchesKeyword && matchesRegion && matchesCategory && matchesAudience
  })

  return [...result].sort((a, b) => {
    if (sortBy.value === 'duration') return durationRank(a.suggestedDuration) - durationRank(b.suggestedDuration)
    if (sortBy.value === 'season') return a.bestMonths[0] - b.bestMonths[0]
    return b.popularityScore - a.popularityScore
  })
})

const activeFilterCount = computed(
  () => selectedRegions.value.length + selectedAudiences.value.length + selectedCategories.value.length + (keyword.value ? 1 : 0)
)

const favoriteNames = computed(() => attractions.filter((item) => favorites.value.includes(item.id)).map((item) => item.name))
const topHeroAttractions = computed(() =>
  [...attractions].sort((a, b) => b.popularityScore - a.popularityScore).slice(0, 3)
)
const activeHeroAttraction = computed(() => topHeroAttractions.value[heroIndex.value] || topHeroAttractions.value[0])

function handleHashChange() {
  routeHash.value = window.location.hash || '#/'
  authError.value = ''
  authMessage.value = ''
}

function showHero(index) {
  heroIndex.value = index
  window.clearInterval(heroTimer)
  heroTimer = window.setInterval(showNextHero, 5000)
}

function showNextHero() {
  heroIndex.value = (heroIndex.value + 1) % topHeroAttractions.value.length
}

function navigate(path) {
  window.location.hash = path
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleValue(collection, value) {
  collection.value = collection.value.includes(value)
    ? collection.value.filter((item) => item !== value)
    : [...collection.value, value]
}

function clearFilters() {
  keyword.value = ''
  selectedRegions.value = []
  selectedAudiences.value = []
  selectedCategories.value = []
  sortBy.value = 'popular'
}

function bestMonthsText(months) {
  return months.map((month) => `${month}月`).join('、')
}

function durationRank(duration) {
  const firstNumber = Number.parseFloat(duration)
  return Number.isNaN(firstNumber) ? 99 : firstNumber
}

function loadUsers() {
  return JSON.parse(localStorage.getItem('tripGuideUsers') || '[]')
}

function saveUsers(users) {
  localStorage.setItem('tripGuideUsers', JSON.stringify(users))
}

function loadCurrentUser() {
  return JSON.parse(localStorage.getItem('tripGuideCurrentUser') || 'null')
}

function saveCurrentUser(user) {
  currentUser.value = user
  localStorage.setItem('tripGuideCurrentUser', JSON.stringify(user))
}

function loadFavorites() {
  return JSON.parse(localStorage.getItem('tripGuideFavorites') || '[]')
}

function saveFavorites(nextFavorites) {
  favorites.value = nextFavorites
  localStorage.setItem('tripGuideFavorites', JSON.stringify(nextFavorites))
}

function simplePasswordHash(password) {
  return btoa(unescape(encodeURIComponent(`trip-guide:${password}`)))
}

function validatePassword(password) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function loginRedirectTarget() {
  return sessionStorage.getItem('tripGuideRedirect') || '/'
}

function requestLogin() {
  sessionStorage.setItem('tripGuideRedirect', currentPath.value)
  navigate('/login')
}

function handleLogin() {
  authError.value = ''
  const email = loginForm.value.email.trim().toLowerCase()
  const password = loginForm.value.password

  if (!email || !password) {
    authError.value = '请输入邮箱和密码。'
    return
  }

  const user = loadUsers().find((item) => item.email === email)
  if (!user || user.passwordHash !== simplePasswordHash(password)) {
    authError.value = '邮箱或密码错误。'
    return
  }

  saveCurrentUser({ id: user.id, username: user.username, email: user.email, createdAt: user.createdAt })
  const target = loginRedirectTarget()
  sessionStorage.removeItem('tripGuideRedirect')
  loginForm.value = { email: '', password: '' }
  navigate(target)
}

function handleRegister() {
  authError.value = ''
  const username = registerForm.value.username.trim()
  const email = registerForm.value.email.trim().toLowerCase()
  const password = registerForm.value.password
  const confirmPassword = registerForm.value.confirmPassword

  if (!/^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/.test(username)) {
    authError.value = '用户名需为 3-20 个字符，可包含中文、英文、数字和下划线。'
    return
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authError.value = '请输入有效邮箱。'
    return
  }

  if (!validatePassword(password)) {
    authError.value = '密码至少 8 位，且包含字母和数字。'
    return
  }

  if (password !== confirmPassword) {
    authError.value = '两次输入的密码不一致。'
    return
  }

  if (!registerForm.value.accepted) {
    authError.value = '请先同意用户协议。'
    return
  }

  const users = loadUsers()
  if (users.some((item) => item.email === email || item.username === username)) {
    authError.value = '用户名或邮箱不可用。'
    return
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash: simplePasswordHash(password),
    createdAt: new Date().toISOString()
  }

  saveUsers([...users, user])
  saveCurrentUser({ id: user.id, username: user.username, email: user.email, createdAt: user.createdAt })
  registerForm.value = { username: '', email: '', password: '', confirmPassword: '', accepted: false }
  const target = loginRedirectTarget()
  sessionStorage.removeItem('tripGuideRedirect')
  navigate(target)
}

function logout() {
  localStorage.removeItem('tripGuideCurrentUser')
  currentUser.value = null
  authMessage.value = '已退出登录。'
  navigate('/')
}

function toggleFavorite(attractionId) {
  if (!currentUser.value) {
    requestLogin()
    return
  }

  saveFavorites(
    favorites.value.includes(attractionId)
      ? favorites.value.filter((item) => item !== attractionId)
      : [...favorites.value, attractionId]
  )
}
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <button class="brand" type="button" @click="navigate('/')">
        <span class="brand-mark">TG</span>
        <span>
          <strong>Trip Guide</strong>
          <small>中国热门景点攻略</small>
        </span>
      </button>

      <nav class="nav-actions" aria-label="主导航">
        <button :class="{ active: routeName === 'home' }" type="button" @click="navigate('/')">景点</button>
        <button v-if="!currentUser" type="button" @click="navigate('/login')">登录</button>
        <button v-if="!currentUser" class="primary-btn" type="button" @click="navigate('/register')">注册</button>
        <button v-if="currentUser" type="button" @click="navigate('/profile')">{{ currentUser.username }}</button>
        <button v-if="currentUser" type="button" @click="logout">退出</button>
      </nav>
    </header>

    <main>
      <section v-if="routeName === 'home'" class="home-view">
        <div class="travel-strip">
          <img
            v-for="(attraction, index) in topHeroAttractions"
            :key="attraction.id"
            :src="attraction.coverImage"
            :alt="attraction.name"
            :class="{ active: index === heroIndex }"
            class="hero-slide"
          />
          <div class="travel-copy">
            <p>TOP {{ heroIndex + 1 }} · {{ activeHeroAttraction.name }}</p>
            <h1>中国热门景点攻略</h1>
            <button type="button" @click="navigate(`/attractions/${activeHeroAttraction.id}`)">查看景点</button>
          </div>
          <div class="hero-side">
            <div class="strip-stats">
              <span><strong>{{ attractions.length }}</strong>景点</span>
              <span><strong>{{ regions.length }}</strong>地区</span>
              <span><strong>{{ audienceOptions.length }}</strong>人群</span>
            </div>
            <div class="carousel-controls" aria-label="热门景点轮播">
              <button
                v-for="(attraction, index) in topHeroAttractions"
                :key="attraction.id"
                :class="{ active: index === heroIndex }"
                type="button"
                :aria-label="`切换到${attraction.name}`"
                @click="showHero(index)"
              >
                {{ index + 1 }}
              </button>
            </div>
          </div>
        </div>

        <section class="filter-panel" aria-label="景点筛选">
          <div class="filter-row main-filter">
            <label>
              <span>搜索</span>
              <input v-model="keyword" type="search" placeholder="景点、城市、标签" />
            </label>
            <label>
              <span>排序</span>
              <select v-model="sortBy">
                <option value="popular">推荐热度</option>
                <option value="duration">游玩时长</option>
                <option value="season">适合月份</option>
              </select>
            </label>
            <button class="ghost-btn" type="button" :disabled="activeFilterCount === 0" @click="clearFilters">
              清空筛选
            </button>
          </div>

          <div class="chip-group" aria-label="地区筛选">
            <span class="group-label">地区</span>
            <button
              v-for="region in regions"
              :key="region"
              :class="{ selected: selectedRegions.includes(region) }"
              type="button"
              @click="toggleValue(selectedRegions, region)"
            >
              {{ region }}
            </button>
          </div>

          <div class="chip-group" aria-label="人群筛选">
            <span class="group-label">人群</span>
            <button
              v-for="audience in audienceOptions"
              :key="audience"
              :class="{ selected: selectedAudiences.includes(audience) }"
              type="button"
              @click="toggleValue(selectedAudiences, audience)"
            >
              {{ audience }}
            </button>
          </div>

          <div class="chip-group" aria-label="类型筛选">
            <span class="group-label">类型</span>
            <button
              v-for="category in categoryOptions"
              :key="category"
              :class="{ selected: selectedCategories.includes(category) }"
              type="button"
              @click="toggleValue(selectedCategories, category)"
            >
              {{ category }}
            </button>
          </div>
        </section>

        <div class="result-head">
          <h2>景点卡片</h2>
          <span>{{ filteredAttractions.length }} 个结果</span>
        </div>

        <section v-if="filteredAttractions.length" class="card-grid" aria-label="景点列表">
          <article
            v-for="attraction in filteredAttractions"
            :key="attraction.id"
            class="attraction-card"
            @click="navigate(`/attractions/${attraction.id}`)"
          >
            <img :src="attraction.coverImage" :alt="attraction.name" loading="lazy" />
            <div class="card-body">
              <div class="card-title-line">
                <h3>{{ attraction.name }}</h3>
                <span>{{ attraction.region }}</span>
              </div>
              <p>{{ attraction.summary }}</p>
              <div class="meta-line">
                <span>{{ attraction.city }} · {{ attraction.province }}</span>
                <span>{{ attraction.suggestedDuration }}</span>
              </div>
              <div class="tag-row">
                <span v-for="tag in attraction.categories.slice(0, 3)" :key="tag">{{ tag }}</span>
              </div>
              <div class="audience-row">
                <span v-for="tag in attraction.audienceTags.slice(0, 4)" :key="tag">{{ tag }}</span>
                <span v-if="attraction.audienceTags.length > 4">+{{ attraction.audienceTags.length - 4 }}</span>
              </div>
              <div class="card-footer">
                <span>适合 {{ bestMonthsText(attraction.bestMonths) }}</span>
                <button type="button" @click.stop="navigate(`/attractions/${attraction.id}`)">详情</button>
              </div>
            </div>
          </article>
        </section>

        <section v-else class="empty-state">
          <h2>没有匹配的景点</h2>
          <p>调整地区、人群或类型后再查看。</p>
          <button class="primary-btn" type="button" @click="clearFilters">清空筛选</button>
        </section>
      </section>

      <section v-else-if="routeName === 'detail'" class="detail-view">
        <div class="detail-hero">
          <img :src="selectedAttraction.coverImage" :alt="selectedAttraction.name" />
          <div class="detail-hero-copy">
            <button class="back-btn" type="button" @click="navigate('/')">返回列表</button>
            <p>{{ selectedAttraction.region }} · {{ selectedAttraction.city }}</p>
            <h1>{{ selectedAttraction.name }}</h1>
            <span>{{ selectedAttraction.summary }}</span>
          </div>
        </div>

        <div class="detail-layout">
          <aside class="quick-facts">
            <h2>基础信息</h2>
            <dl>
              <div>
                <dt>地址</dt>
                <dd>{{ selectedAttraction.address }}</dd>
              </div>
              <div>
                <dt>建议时长</dt>
                <dd>{{ selectedAttraction.suggestedDuration }}</dd>
              </div>
              <div>
                <dt>出行月份</dt>
                <dd>{{ bestMonthsText(selectedAttraction.bestMonths) }}</dd>
              </div>
              <div>
                <dt>预算参考</dt>
                <dd>{{ selectedAttraction.budget }}</dd>
              </div>
            </dl>
            <button
              class="primary-btn wide"
              type="button"
              @click="toggleFavorite(selectedAttraction.id)"
            >
              {{ favorites.includes(selectedAttraction.id) ? '已收藏' : '收藏景点' }}
            </button>
          </aside>

          <div class="detail-content">
            <section>
              <h2>出行时间</h2>
              <p>{{ selectedAttraction.travelTimeTips }}</p>
            </section>

            <section>
              <h2>到达方式</h2>
              <div class="transport-grid">
                <div v-for="(value, key) in selectedAttraction.transportation" :key="key">
                  <strong>
                    {{
                      {
                        plane: '飞机',
                        rail: '高铁/火车',
                        local: '市内交通',
                        selfDrive: '自驾'
                      }[key]
                    }}
                  </strong>
                  <p>{{ value }}</p>
                </div>
              </div>
            </section>

            <section>
              <h2>推荐路线</h2>
              <ol class="step-list">
                <li v-for="tip in selectedAttraction.routeTips" :key="tip">{{ tip }}</li>
              </ol>
            </section>

            <section>
              <h2>必看亮点</h2>
              <div class="tag-row large">
                <span v-for="item in selectedAttraction.highlights" :key="item">{{ item }}</span>
              </div>
            </section>

            <section>
              <h2>适合人群</h2>
              <div class="audience-row large">
                <span v-for="item in selectedAttraction.audienceTags" :key="item">{{ item }}</span>
              </div>
            </section>

            <section>
              <h2>注意事项</h2>
              <ul class="plain-list">
                <li v-for="notice in selectedAttraction.notices" :key="notice">{{ notice }}</li>
              </ul>
            </section>

            <section>
              <h2>周边推荐</h2>
              <div class="nearby-list">
                <span v-for="item in selectedAttraction.nearby" :key="item">{{ item }}</span>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section v-else-if="routeName === 'login'" class="auth-view">
        <form class="auth-panel" @submit.prevent="handleLogin">
          <h1>登录</h1>
          <label>
            <span>邮箱</span>
            <input v-model="loginForm.email" type="email" autocomplete="email" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="loginForm.password" type="password" autocomplete="current-password" />
          </label>
          <p v-if="authError" class="form-error">{{ authError }}</p>
          <button class="primary-btn wide" type="submit">登录</button>
          <button class="link-btn" type="button" @click="navigate('/register')">创建账号</button>
        </form>
      </section>

      <section v-else-if="routeName === 'register'" class="auth-view">
        <form class="auth-panel" @submit.prevent="handleRegister">
          <h1>注册</h1>
          <label>
            <span>用户名</span>
            <input v-model="registerForm.username" type="text" autocomplete="username" />
          </label>
          <label>
            <span>邮箱</span>
            <input v-model="registerForm.email" type="email" autocomplete="email" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="registerForm.password" type="password" autocomplete="new-password" />
          </label>
          <label>
            <span>确认密码</span>
            <input v-model="registerForm.confirmPassword" type="password" autocomplete="new-password" />
          </label>
          <label class="checkbox-line">
            <input v-model="registerForm.accepted" type="checkbox" />
            <span>同意用户协议</span>
          </label>
          <p v-if="authError" class="form-error">{{ authError }}</p>
          <button class="primary-btn wide" type="submit">注册并登录</button>
          <button class="link-btn" type="button" @click="navigate('/login')">已有账号登录</button>
        </form>
      </section>

      <section v-else-if="routeName === 'profile'" class="profile-view">
        <div v-if="currentUser" class="profile-panel">
          <h1>用户中心</h1>
          <dl>
            <div>
              <dt>用户名</dt>
              <dd>{{ currentUser.username }}</dd>
            </div>
            <div>
              <dt>邮箱</dt>
              <dd>{{ currentUser.email }}</dd>
            </div>
            <div>
              <dt>注册时间</dt>
              <dd>{{ new Date(currentUser.createdAt).toLocaleDateString('zh-CN') }}</dd>
            </div>
          </dl>
          <section>
            <h2>我的收藏</h2>
            <p v-if="favoriteNames.length">{{ favoriteNames.join('、') }}</p>
            <p v-else>暂无收藏。</p>
          </section>
        </div>
        <div v-else class="empty-state">
          <h1>请先登录</h1>
          <button class="primary-btn" type="button" @click="navigate('/login')">登录</button>
        </div>
      </section>

      <section v-else class="empty-state not-found">
        <h1>页面不存在</h1>
        <p>目标景点或页面暂未收录。</p>
        <button class="primary-btn" type="button" @click="navigate('/')">返回首页</button>
      </section>
    </main>
  </div>
</template>
