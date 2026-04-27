<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { audienceOptions, categoryOptions, regions as defaultRegions } from './data/attractions'

const routeHash = ref(window.location.hash || '#/')
const keyword = ref('')
const selectedRegions = ref([])
const selectedAudiences = ref([])
const selectedCategories = ref([])
const sortBy = ref('popular')
const attractions = ref([])
const attractionsLoading = ref(false)
const attractionsError = ref('')
const publicRegions = ref([])
const authError = ref('')
const authMessage = ref('')
const authLoading = ref(false)
const adminUsers = ref([])
const adminLoading = ref(false)
const adminError = ref('')
const adminMessage = ref('')
const adminSettingsOpen = ref(true)
const adminTravelOpen = ref(true)
const adminAttractions = ref([])
const adminRegions = ref([])
const editingAttractionId = ref('')
const editingRegionId = ref('')
const showAttractionDialog = ref(false)
const showRegionDialog = ref(false)
const resetPasswords = ref({})
const emptyRegionForm = {
  id: '',
  name: ''
}
const regionForm = ref({ ...emptyRegionForm })
const emptyAttractionForm = {
  id: '',
  name: '',
  regionId: '',
  province: '',
  city: '',
  address: '',
  summary: '',
  categoriesText: '',
  audienceTagsText: '',
  suggestedDuration: '',
  bestMonthsText: '',
  budget: '',
  popularityScore: '',
  coverImage: '',
  travelTimeTips: '',
  transportationPlane: '',
  transportationRail: '',
  transportationLocal: '',
  transportationSelfDrive: '',
  routeTipsText: '',
  highlightsText: '',
  noticesText: '',
  nearbyText: ''
}
const attractionForm = ref({ ...emptyAttractionForm })
const heroIndex = ref(0)
const loginForm = ref({ identifier: '', password: '' })
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
  loadPublicRegions()
  loadAttractions()
  loadAdminDataIfNeeded()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', handleHashChange)
  window.clearInterval(heroTimer)
})

const currentPath = computed(() => routeHash.value.replace(/^#/, '') || '/')
const detailId = computed(() => currentPath.value.match(/^\/attractions\/([^/]+)$/)?.[1] || '')
const selectedAttraction = computed(() => attractions.value.find((item) => item.id === detailId.value))

const routeName = computed(() => {
  if (currentPath.value === '/' || currentPath.value === '/attractions') return 'home'
  if (currentPath.value === '/login') return 'login'
  if (currentPath.value === '/register') return 'register'
  if (currentPath.value === '/admin' || currentPath.value.startsWith('/admin/')) return 'admin'
  if (currentPath.value === '/profile') return 'profile'
  if (detailId.value) return selectedAttraction.value ? 'detail' : 'missing'
  return 'missing'
})

const filteredAttractions = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  const result = attractions.value.filter((item) => {
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
    if (sortBy.value === 'season') return (a.bestMonths[0] || 99) - (b.bestMonths[0] || 99)
    return (b.popularityScore || 0) - (a.popularityScore || 0)
  })
})

const activeFilterCount = computed(
  () => selectedRegions.value.length + selectedAudiences.value.length + selectedCategories.value.length + (keyword.value ? 1 : 0)
)

const favoriteNames = computed(() =>
  attractions.value.filter((item) => favorites.value.includes(item.id)).map((item) => item.name)
)
const isAdmin = computed(() => currentUser.value?.role === 'admin')
const isAdminHome = computed(() => currentPath.value === '/admin')
const isAdminUsersPage = computed(() => currentPath.value === '/admin/users')
const isAdminRegionsPage = computed(() => currentPath.value === '/admin/regions')
const isAdminAttractionsPage = computed(() => currentPath.value === '/admin/attractions')
const adminStats = computed(() => {
  const total = adminUsers.value.length
  const active = adminUsers.value.filter((user) => user.isActive).length
  const disabled = total - active
  const admins = adminUsers.value.filter((user) => user.role === 'admin').length

  return { total, active, disabled, admins }
})
const adminAttractionStats = computed(() => {
  const total = adminAttractions.value.length
  const active = adminAttractions.value.filter((item) => item.isActive).length
  return { total, active, disabled: total - active }
})
const adminRegionStats = computed(() => {
  const total = adminRegions.value.length
  const active = adminRegions.value.filter((item) => item.isActive).length
  return { total, active, disabled: total - active }
})
const regionOptions = computed(() =>
  publicRegions.value.length
    ? publicRegions.value
    : defaultRegions.map((name) => ({
        id: name,
        name,
        isActive: true
      }))
)
const topHeroAttractions = computed(() =>
  [...attractions.value].sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0)).slice(0, 3)
)
const activeHeroAttraction = computed(() => topHeroAttractions.value[heroIndex.value] || topHeroAttractions.value[0])
const selectedTransportation = computed(() => selectedAttraction.value?.transportation || {})

watch(currentPath, () => {
  loadAdminDataIfNeeded()
})

function handleHashChange() {
  routeHash.value = window.location.hash || '#/'
  authError.value = ''
  authMessage.value = ''
  adminError.value = ''
  adminMessage.value = ''
}

function showHero(index) {
  heroIndex.value = index
  window.clearInterval(heroTimer)
  heroTimer = window.setInterval(showNextHero, 5000)
}

function showNextHero() {
  if (topHeroAttractions.value.length === 0) return
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

function normalizeAttraction(attraction) {
  return {
    ...attraction,
    region: attraction.region || '',
    province: attraction.province || '',
    city: attraction.city || '',
    address: attraction.address || '',
    summary: attraction.summary || '',
    categories: Array.isArray(attraction.categories) ? attraction.categories : [],
    audienceTags: Array.isArray(attraction.audienceTags) ? attraction.audienceTags : [],
    suggestedDuration: attraction.suggestedDuration || '',
    bestMonths: Array.isArray(attraction.bestMonths) ? attraction.bestMonths : [],
    budget: attraction.budget || '',
    popularityScore: Number.isFinite(Number(attraction.popularityScore)) ? Number(attraction.popularityScore) : 0,
    coverImage: attraction.coverImage || '/images/west-lake.jpg',
    travelTimeTips: attraction.travelTimeTips || '',
    transportation: attraction.transportation || {},
    routeTips: Array.isArray(attraction.routeTips) ? attraction.routeTips : [],
    highlights: Array.isArray(attraction.highlights) ? attraction.highlights : [],
    notices: Array.isArray(attraction.notices) ? attraction.notices : [],
    nearby: Array.isArray(attraction.nearby) ? attraction.nearby : []
  }
}

async function loadAttractions() {
  attractionsLoading.value = true
  attractionsError.value = ''
  try {
    const result = await apiRequest('/api/attractions', undefined, { method: 'GET' })
    attractions.value = result.attractions.map(normalizeAttraction)
    heroIndex.value = 0
  } catch (error) {
    attractionsError.value = error.message
  } finally {
    attractionsLoading.value = false
  }
}

async function loadPublicRegions() {
  try {
    const result = await apiRequest('/api/regions', undefined, { method: 'GET' })
    publicRegions.value = result.regions
    const availableNames = new Set(publicRegions.value.map((region) => region.name))
    selectedRegions.value = selectedRegions.value.filter((name) => availableNames.has(name))
  } catch {
    publicRegions.value = defaultRegions.map((name) => ({
      id: name,
      name,
      isActive: true
    }))
  }
}

function validatePassword(password) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

async function apiRequest(path, data, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.admin) {
    headers['X-User-Id'] = currentUser.value?.id || ''
  }

  const response = await fetch(path, {
    method: options.method || 'POST',
    headers,
    body: data === undefined ? undefined : JSON.stringify(data)
  })
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.message || '请求失败，请稍后再试。')
  }

  return result
}

function loginRedirectTarget() {
  return sessionStorage.getItem('tripGuideRedirect') || '/'
}

function requestLogin() {
  sessionStorage.setItem('tripGuideRedirect', currentPath.value)
  navigate('/login')
}

async function handleLogin() {
  authError.value = ''
  const identifier = loginForm.value.identifier.trim()
  const password = loginForm.value.password

  if (!identifier || !password) {
    authError.value = '请输入用户名或邮箱和密码。'
    return
  }

  authLoading.value = true
  try {
    const { user } = await apiRequest('/api/auth/login', { identifier, password })
    saveCurrentUser(user)
    const target = loginRedirectTarget()
    sessionStorage.removeItem('tripGuideRedirect')
    loginForm.value = { identifier: '', password: '' }
    navigate(target)
  } catch (error) {
    authError.value = error.message
  } finally {
    authLoading.value = false
  }
}

async function handleRegister() {
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

  authLoading.value = true
  try {
    const { user } = await apiRequest('/api/auth/register', { username, email, password })
    saveCurrentUser(user)
    registerForm.value = { username: '', email: '', password: '', confirmPassword: '', accepted: false }
    const target = loginRedirectTarget()
    sessionStorage.removeItem('tripGuideRedirect')
    navigate(target)
  } catch (error) {
    authError.value = error.message
  } finally {
    authLoading.value = false
  }
}

function logout() {
  localStorage.removeItem('tripGuideCurrentUser')
  currentUser.value = null
  adminUsers.value = []
  adminAttractions.value = []
  adminRegions.value = []
  authMessage.value = '已退出登录。'
  navigate('/')
}

async function loadAdminDataIfNeeded() {
  if (routeName.value !== 'admin' || !isAdmin.value) return
  await Promise.all([loadAdminUsers(), loadAdminAttractions(), loadAdminRegions()])
}

async function loadAdminUsersIfNeeded() {
  await loadAdminUsers()
}

async function loadAdminUsers() {
  if (routeName.value !== 'admin' || !isAdmin.value) return

  adminLoading.value = true
  adminError.value = ''
  try {
    const { users } = await apiRequest('/api/admin/users', undefined, { method: 'GET', admin: true })
    adminUsers.value = users
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function loadAdminAttractions() {
  if (routeName.value !== 'admin' || !isAdmin.value) return

  adminLoading.value = true
  adminError.value = ''
  try {
    const result = await apiRequest('/api/admin/attractions', undefined, { method: 'GET', admin: true })
    adminAttractions.value = result.attractions
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function loadAdminRegions() {
  if (routeName.value !== 'admin' || !isAdmin.value) return

  adminLoading.value = true
  adminError.value = ''
  try {
    const result = await apiRequest('/api/admin/regions', undefined, { method: 'GET', admin: true })
    adminRegions.value = result.regions
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function resetUserPassword(user) {
  adminError.value = ''
  adminMessage.value = ''
  const password = resetPasswords.value[user.id] || ''

  if (!validatePassword(password)) {
    adminError.value = '新密码至少 8 位，且包含字母和数字。'
    return
  }

  adminLoading.value = true
  try {
    const { message } = await apiRequest(
      `/api/admin/users/${user.id}/password`,
      { password },
      { method: 'PATCH', admin: true }
    )
    resetPasswords.value[user.id] = ''
    adminMessage.value = `${user.username}：${message}`
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function setUserStatus(user, isActive) {
  adminError.value = ''
  adminMessage.value = ''
  adminLoading.value = true
  try {
    const { message } = await apiRequest(
      `/api/admin/users/${user.id}/status`,
      { isActive },
      { method: 'PATCH', admin: true }
    )
    adminMessage.value = `${user.username}：${message}`
    await loadAdminUsersIfNeeded()
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

function regionFormPayload() {
  return {
    id: regionForm.value.id.trim(),
    name: regionForm.value.name.trim()
  }
}

function validateRegionRequiredFields(payload) {
  if (!payload.id) return '请填写地区 ID。'
  if (!payload.name) return '请填写地区名称。'
  return ''
}

function resetRegionForm() {
  editingRegionId.value = ''
  regionForm.value = { ...emptyRegionForm }
}

function openNewRegionDialog() {
  adminError.value = ''
  adminMessage.value = ''
  resetRegionForm()
  showRegionDialog.value = true
}

function closeRegionDialog() {
  adminError.value = ''
  showRegionDialog.value = false
  resetRegionForm()
}

function editRegion(region) {
  adminError.value = ''
  adminMessage.value = ''
  editingRegionId.value = region.id
  regionForm.value = {
    id: region.id,
    name: region.name
  }
  showRegionDialog.value = true
}

async function saveRegion() {
  adminError.value = ''
  adminMessage.value = ''
  const payload = regionFormPayload()
  const validationMessage = validateRegionRequiredFields(payload)

  if (validationMessage) {
    adminError.value = validationMessage
    return
  }

  adminLoading.value = true
  try {
    const result = editingRegionId.value
      ? await apiRequest(`/api/admin/regions/${editingRegionId.value}`, payload, { method: 'PATCH', admin: true })
      : await apiRequest('/api/admin/regions', payload, { method: 'POST', admin: true })
    adminMessage.value = `${payload.name}：${result.message}`
    showRegionDialog.value = false
    resetRegionForm()
    await loadAdminRegions()
    await loadPublicRegions()
    await loadAdminAttractions()
    await loadAttractions()
  } catch (error) {
    adminError.value = error.message
    window.alert(error.message)
  } finally {
    adminLoading.value = false
  }
}

async function setRegionStatus(region, isActive) {
  adminError.value = ''
  adminMessage.value = ''
  adminLoading.value = true

  try {
    const { message } = await apiRequest(
      `/api/admin/regions/${region.id}/status`,
      { isActive },
      { method: 'PATCH', admin: true }
    )
    adminMessage.value = `${region.name}：${message}`
    await loadAdminRegions()
    await loadPublicRegions()
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function deleteRegion(region) {
  if (!window.confirm(`确认删除“${region.name}”？`)) return

  adminError.value = ''
  adminMessage.value = ''
  adminLoading.value = true

  try {
    const { message } = await apiRequest(`/api/admin/regions/${region.id}`, undefined, {
      method: 'DELETE',
      admin: true
    })
    adminMessage.value = `${region.name}：${message}`
    if (editingRegionId.value === region.id) resetRegionForm()
    await loadAdminRegions()
    await loadPublicRegions()
    await loadAdminAttractions()
    await loadAttractions()
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

function splitTextList(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function attractionFormPayload() {
  return {
    id: attractionForm.value.id.trim(),
    name: attractionForm.value.name.trim(),
    regionId: attractionForm.value.regionId.trim(),
    province: attractionForm.value.province.trim(),
    city: attractionForm.value.city.trim(),
    address: attractionForm.value.address.trim(),
    summary: attractionForm.value.summary.trim(),
    categories: splitTextList(attractionForm.value.categoriesText),
    audienceTags: splitTextList(attractionForm.value.audienceTagsText),
    suggestedDuration: attractionForm.value.suggestedDuration.trim(),
    bestMonths: splitTextList(attractionForm.value.bestMonthsText),
    budget: attractionForm.value.budget.trim(),
    popularityScore: attractionForm.value.popularityScore === '' ? null : attractionForm.value.popularityScore,
    coverImage: attractionForm.value.coverImage.trim(),
    travelTimeTips: attractionForm.value.travelTimeTips.trim(),
    transportation: {
      plane: attractionForm.value.transportationPlane.trim(),
      rail: attractionForm.value.transportationRail.trim(),
      local: attractionForm.value.transportationLocal.trim(),
      selfDrive: attractionForm.value.transportationSelfDrive.trim()
    },
    routeTips: splitTextList(attractionForm.value.routeTipsText),
    highlights: splitTextList(attractionForm.value.highlightsText),
    notices: splitTextList(attractionForm.value.noticesText),
    nearby: splitTextList(attractionForm.value.nearbyText)
  }
}

function validateAttractionRequiredFields(payload) {
  if (!payload.id) return '请填写景点 ID。'
  if (!payload.name) return '请填写景点名称。'
  return ''
}

function resetAttractionForm() {
  editingAttractionId.value = ''
  attractionForm.value = { ...emptyAttractionForm }
}

function openNewAttractionDialog() {
  adminError.value = ''
  adminMessage.value = ''
  resetAttractionForm()
  showAttractionDialog.value = true
}

function closeAttractionDialog() {
  adminError.value = ''
  showAttractionDialog.value = false
  resetAttractionForm()
}

function editAttraction(attraction) {
  adminError.value = ''
  adminMessage.value = ''
  editingAttractionId.value = attraction.id
  attractionForm.value = {
    id: attraction.id,
    name: attraction.name,
    regionId: attraction.regionId || '',
    province: attraction.province,
    city: attraction.city,
    address: attraction.address,
    summary: attraction.summary,
    categoriesText: attraction.categories.join(', '),
    audienceTagsText: attraction.audienceTags.join(', '),
    suggestedDuration: attraction.suggestedDuration,
    bestMonthsText: attraction.bestMonths.join(', '),
    budget: attraction.budget,
    popularityScore: attraction.popularityScore,
    coverImage: attraction.coverImage,
    travelTimeTips: attraction.travelTimeTips || '',
    transportationPlane: attraction.transportation?.plane || '',
    transportationRail: attraction.transportation?.rail || '',
    transportationLocal: attraction.transportation?.local || '',
    transportationSelfDrive: attraction.transportation?.selfDrive || '',
    routeTipsText: (attraction.routeTips || []).join(', '),
    highlightsText: (attraction.highlights || []).join(', '),
    noticesText: (attraction.notices || []).join(', '),
    nearbyText: (attraction.nearby || []).join(', ')
  }
  showAttractionDialog.value = true
}

async function saveAttraction() {
  adminError.value = ''
  adminMessage.value = ''
  const payload = attractionFormPayload()
  const validationMessage = validateAttractionRequiredFields(payload)

  if (validationMessage) {
    adminError.value = validationMessage
    return
  }

  adminLoading.value = true
  try {
    const result = editingAttractionId.value
      ? await apiRequest(`/api/admin/attractions/${editingAttractionId.value}`, payload, { method: 'PATCH', admin: true })
      : await apiRequest('/api/admin/attractions', payload, { method: 'POST', admin: true })
    adminMessage.value = `${payload.name}：${result.message}`
    showAttractionDialog.value = false
    resetAttractionForm()
    await loadAdminAttractions()
    await loadAttractions()
  } catch (error) {
    adminError.value = error.message
    window.alert(error.message)
  } finally {
    adminLoading.value = false
  }
}

async function setAttractionStatus(attraction, isActive) {
  adminError.value = ''
  adminMessage.value = ''
  adminLoading.value = true

  try {
    const { message } = await apiRequest(
      `/api/admin/attractions/${attraction.id}/status`,
      { isActive },
      { method: 'PATCH', admin: true }
    )
    adminMessage.value = `${attraction.name}：${message}`
    await loadAdminAttractions()
    await loadAttractions()
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
}

async function deleteAttraction(attraction) {
  if (!window.confirm(`确认删除“${attraction.name}”？`)) return

  adminError.value = ''
  adminMessage.value = ''
  adminLoading.value = true

  try {
    const { message } = await apiRequest(`/api/admin/attractions/${attraction.id}`, undefined, {
      method: 'DELETE',
      admin: true
    })
    adminMessage.value = `${attraction.name}：${message}`
    if (editingAttractionId.value === attraction.id) resetAttractionForm()
    await loadAdminAttractions()
    await loadAttractions()
  } catch (error) {
    adminError.value = error.message
  } finally {
    adminLoading.value = false
  }
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
        <button v-if="isAdmin" :class="{ active: routeName === 'admin' }" type="button" @click="navigate('/admin')">
          后台
        </button>
        <button v-if="!currentUser" type="button" @click="navigate('/login')">登录</button>
        <button v-if="!currentUser" class="primary-btn" type="button" @click="navigate('/register')">注册</button>
        <button v-if="currentUser" type="button" @click="navigate('/profile')">{{ currentUser.username }}</button>
        <button v-if="currentUser" type="button" @click="logout">退出</button>
      </nav>
    </header>

    <main>
      <section v-if="routeName === 'home'" class="home-view">
        <div v-if="activeHeroAttraction" class="travel-strip">
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
              <span><strong>{{ regionOptions.length }}</strong>地区</span>
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
        <section v-else class="empty-state">
          <h2>{{ attractionsLoading ? '正在加载景点' : '暂无景点' }}</h2>
          <p>{{ attractionsError || '后台启用景点后会显示在首页。' }}</p>
        </section>

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
              v-for="region in regionOptions"
              :key="region.id"
              :class="{ selected: selectedRegions.includes(region.name) }"
              type="button"
              @click="toggleValue(selectedRegions, region.name)"
            >
              {{ region.name }}
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
          <h2>{{ attractionsLoading ? '正在加载景点' : '没有匹配的景点' }}</h2>
          <p>{{ attractionsError || '调整地区、人群或类型后再查看。' }}</p>
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
              <div v-if="Object.keys(selectedTransportation).length" class="transport-grid">
                <div v-for="(value, key) in selectedTransportation" :key="key">
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
              <p v-else>暂无到达方式信息。</p>
            </section>

            <section>
              <h2>推荐路线</h2>
              <ol v-if="selectedAttraction.routeTips.length" class="step-list">
                <li v-for="tip in selectedAttraction.routeTips" :key="tip">{{ tip }}</li>
              </ol>
              <p v-else>暂无推荐路线。</p>
            </section>

            <section>
              <h2>必看亮点</h2>
              <div v-if="selectedAttraction.highlights.length" class="tag-row large">
                <span v-for="item in selectedAttraction.highlights" :key="item">{{ item }}</span>
              </div>
              <p v-else>暂无亮点信息。</p>
            </section>

            <section>
              <h2>适合人群</h2>
              <div class="audience-row large">
                <span v-for="item in selectedAttraction.audienceTags" :key="item">{{ item }}</span>
              </div>
            </section>

            <section>
              <h2>注意事项</h2>
              <ul v-if="selectedAttraction.notices.length" class="plain-list">
                <li v-for="notice in selectedAttraction.notices" :key="notice">{{ notice }}</li>
              </ul>
              <p v-else>暂无注意事项。</p>
            </section>

            <section>
              <h2>周边推荐</h2>
              <div v-if="selectedAttraction.nearby.length" class="nearby-list">
                <span v-for="item in selectedAttraction.nearby" :key="item">{{ item }}</span>
              </div>
              <p v-else>暂无周边推荐。</p>
            </section>
          </div>
        </div>
      </section>

      <section v-else-if="routeName === 'login'" class="auth-view">
        <form class="auth-panel" @submit.prevent="handleLogin">
          <h1>登录</h1>
          <label>
            <span>用户名或邮箱</span>
            <input v-model="loginForm.identifier" type="text" autocomplete="username" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="loginForm.password" type="password" autocomplete="current-password" />
          </label>
          <p v-if="authError" class="form-error">{{ authError }}</p>
          <button class="primary-btn wide" type="submit" :disabled="authLoading">
            {{ authLoading ? '登录中' : '登录' }}
          </button>
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
          <button class="primary-btn wide" type="submit" :disabled="authLoading">
            {{ authLoading ? '注册中' : '注册并登录' }}
          </button>
          <button class="link-btn" type="button" @click="navigate('/login')">已有账号登录</button>
        </form>
      </section>

      <section v-else-if="routeName === 'admin'" class="admin-view">
        <div v-if="isAdmin" class="admin-shell">
          <aside class="admin-sidebar" aria-label="后台导航">
            <div class="admin-side-brand">
              <strong>Trip Admin</strong>
              <span>Full / Expanded</span>
            </div>

            <button
              :class="['admin-menu-item', { active: isAdminHome }]"
              type="button"
              @click="navigate('/admin')"
            >
              <span>主页</span>
            </button>

            <button class="admin-menu-group" type="button" @click="adminSettingsOpen = !adminSettingsOpen">
              <span>系统管理</span>
              <span>{{ adminSettingsOpen ? '▾' : '▸' }}</span>
            </button>

            <div v-if="adminSettingsOpen" class="admin-sub-menu">
              <button
                :class="['admin-menu-item', 'sub', { active: isAdminUsersPage }]"
                type="button"
                @click="navigate('/admin/users')"
              >
                <span>用户管理</span>
              </button>
              <button
                :class="['admin-menu-item', 'sub', { active: isAdminRegionsPage }]"
                type="button"
                @click="navigate('/admin/regions')"
              >
                <span>地区</span>
              </button>
            </div>

            <button class="admin-menu-group" type="button" @click="adminTravelOpen = !adminTravelOpen">
              <span>旅游</span>
              <span>{{ adminTravelOpen ? '▾' : '▸' }}</span>
            </button>

            <div v-if="adminTravelOpen" class="admin-sub-menu">
              <button
                :class="['admin-menu-item', 'sub', { active: isAdminAttractionsPage }]"
                type="button"
                @click="navigate('/admin/attractions')"
              >
                <span>景点管理</span>
              </button>
            </div>
          </aside>

          <div class="admin-main">
            <div class="admin-head">
              <div>
                <h1>
                  {{
                    isAdminUsersPage
                      ? '用户列表'
                      : isAdminRegionsPage
                        ? '地区管理'
                        : isAdminAttractionsPage
                          ? '景点管理'
                          : '后台主页'
                  }}
                </h1>
                <p>
                  {{
                    isAdminUsersPage
                      ? '查看注册信息、重置密码和调整账号状态。'
                      : isAdminRegionsPage
                        ? '维护地区 ID 和地区名称。'
                        : isAdminAttractionsPage
                          ? '维护景点基础信息，控制景点启用状态。'
                          : '查看后台概览，进入左侧菜单管理基础数据。'
                  }}
                </p>
              </div>
              <div class="admin-head-actions">
                <button v-if="isAdminRegionsPage" class="primary-btn" type="button" @click="openNewRegionDialog">
                  新增
                </button>
                <button v-if="isAdminAttractionsPage" class="primary-btn" type="button" @click="openNewAttractionDialog">
                  新增
                </button>
                <button class="ghost-btn" type="button" :disabled="adminLoading" @click="loadAdminDataIfNeeded">
                  刷新
                </button>
              </div>
            </div>

            <p v-if="adminError" class="form-error">{{ adminError }}</p>
            <p v-if="adminMessage" class="form-success">{{ adminMessage }}</p>

            <section v-if="isAdminHome" class="admin-home-panel">
              <div class="admin-stat-grid">
                <div>
                  <span>注册用户</span>
                  <strong>{{ adminStats.total }}</strong>
                </div>
                <div>
                  <span>启用账号</span>
                  <strong>{{ adminStats.active }}</strong>
                </div>
                <div>
                  <span>停用账号</span>
                  <strong>{{ adminStats.disabled }}</strong>
                </div>
                <div>
                  <span>管理员</span>
                  <strong>{{ adminStats.admins }}</strong>
                </div>
                <div>
                  <span>地区总数</span>
                  <strong>{{ adminRegionStats.total }}</strong>
                </div>
                <div>
                  <span>启用地区</span>
                  <strong>{{ adminRegionStats.active }}</strong>
                </div>
                <div>
                  <span>停用地区</span>
                  <strong>{{ adminRegionStats.disabled }}</strong>
                </div>
                <div>
                  <span>景点总数</span>
                  <strong>{{ adminAttractionStats.total }}</strong>
                </div>
                <div>
                  <span>启用景点</span>
                  <strong>{{ adminAttractionStats.active }}</strong>
                </div>
                <div>
                  <span>停用景点</span>
                  <strong>{{ adminAttractionStats.disabled }}</strong>
                </div>
              </div>
              <div class="admin-home-actions">
                <button class="primary-btn" type="button" @click="navigate('/admin/users')">打开用户列表</button>
                <button class="ghost-btn" type="button" @click="navigate('/admin/regions')">打开地区列表</button>
                <button class="ghost-btn" type="button" @click="navigate('/admin/attractions')">打开景点列表</button>
              </div>
            </section>

            <section v-else-if="isAdminUsersPage" class="admin-list-panel">
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>用户名</th>
                      <th>邮箱</th>
                      <th>角色</th>
                      <th>状态</th>
                      <th>注册时间</th>
                      <th>重置密码</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="user in adminUsers" :key="user.id">
                      <td>{{ user.username }}</td>
                      <td>{{ user.email }}</td>
                      <td>{{ user.role === 'admin' ? '管理员' : '用户' }}</td>
                      <td>
                        <span :class="['status-pill', user.isActive ? 'active' : 'disabled']">
                          {{ user.isActive ? '启用' : '停用' }}
                        </span>
                      </td>
                      <td>{{ new Date(user.createdAt).toLocaleDateString('zh-CN') }}</td>
                      <td>
                        <form class="inline-form" @submit.prevent="resetUserPassword(user)">
                          <input
                            v-model="resetPasswords[user.id]"
                            type="password"
                            autocomplete="new-password"
                            placeholder="新密码"
                          />
                          <button class="ghost-btn" type="submit" :disabled="adminLoading">重置</button>
                        </form>
                      </td>
                      <td>
                        <button
                          v-if="user.isActive"
                          class="danger-btn"
                          type="button"
                          :disabled="adminLoading || user.id === currentUser.id"
                          @click="setUserStatus(user, false)"
                        >
                          停用
                        </button>
                        <button
                          v-else
                          class="ghost-btn"
                          type="button"
                          :disabled="adminLoading"
                          @click="setUserStatus(user, true)"
                        >
                          启用
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!adminLoading && adminUsers.length === 0">
                      <td colspan="7">暂无用户。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section v-else-if="isAdminRegionsPage" class="admin-attractions-panel">
              <div class="admin-list-toolbar">
                <div>
                  <strong>地区列表</strong>
                  <span>{{ adminRegions.length }} 条记录</span>
                </div>
              </div>

              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>地区 ID</th>
                      <th>地区名称</th>
                      <th>状态</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="region in adminRegions" :key="region.id">
                      <td>{{ region.id }}</td>
                      <td>{{ region.name }}</td>
                      <td>
                        <span :class="['status-pill', region.isActive ? 'active' : 'disabled']">
                          {{ region.isActive ? '启用' : '停用' }}
                        </span>
                      </td>
                      <td>{{ new Date(region.updatedAt).toLocaleDateString('zh-CN') }}</td>
                      <td>
                        <div class="row-actions">
                          <button class="ghost-btn" type="button" @click="editRegion(region)">编辑</button>
                          <button
                            v-if="region.isActive"
                            class="danger-btn"
                            type="button"
                            :disabled="adminLoading"
                            @click="setRegionStatus(region, false)"
                          >
                            停用
                          </button>
                          <button
                            v-else
                            class="ghost-btn"
                            type="button"
                            :disabled="adminLoading"
                            @click="setRegionStatus(region, true)"
                          >
                            启用
                          </button>
                          <button class="danger-btn" type="button" :disabled="adminLoading" @click="deleteRegion(region)">
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!adminLoading && adminRegions.length === 0">
                      <td colspan="5">暂无地区。</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="showRegionDialog" class="modal-backdrop" @click.self="closeRegionDialog">
                <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="regionDialogTitle">
                  <div class="modal-head">
                    <div>
                      <h2 id="regionDialogTitle">{{ editingRegionId ? '修改地区' : '新增地区' }}</h2>
                      <p>录入地区 ID 和地区名称后保存。</p>
                    </div>
                    <button class="ghost-btn" type="button" @click="closeRegionDialog">关闭</button>
                  </div>

                  <p v-if="adminError" class="form-error">{{ adminError }}</p>

                  <form class="admin-form-grid" @submit.prevent="saveRegion">
                    <label>
                      <span class="required-label">地区 ID</span>
                      <input
                        v-model="regionForm.id"
                        type="text"
                        :disabled="Boolean(editingRegionId)"
                        aria-required="true"
                      />
                    </label>
                    <label>
                      <span class="required-label">地区名称</span>
                      <input v-model="regionForm.name" type="text" aria-required="true" />
                    </label>
                    <div class="admin-form-actions span-2">
                      <button class="primary-btn" type="submit" :disabled="adminLoading">保存</button>
                      <button class="ghost-btn" type="button" @click="closeRegionDialog">取消</button>
                    </div>
                  </form>
                </div>
              </div>
            </section>

            <section v-else-if="isAdminAttractionsPage" class="admin-attractions-panel">
              <div class="admin-list-toolbar">
                <div>
                  <strong>景点列表</strong>
                  <span>{{ adminAttractions.length }} 条记录</span>
                </div>
              </div>

              <div class="admin-table-wrap">
                <table class="admin-table attraction-table">
                  <thead>
                    <tr>
                      <th>景点</th>
                      <th>地区</th>
                      <th>城市</th>
                      <th>热度</th>
                      <th>状态</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="attraction in adminAttractions" :key="attraction.id">
                      <td>
                        <strong>{{ attraction.name }}</strong>
                        <span>{{ attraction.id }}</span>
                      </td>
                      <td>{{ attraction.region }}</td>
                      <td>{{ attraction.city }}</td>
                      <td>{{ attraction.popularityScore }}</td>
                      <td>
                        <span :class="['status-pill', attraction.isActive ? 'active' : 'disabled']">
                          {{ attraction.isActive ? '启用' : '停用' }}
                        </span>
                      </td>
                      <td>{{ new Date(attraction.updatedAt).toLocaleDateString('zh-CN') }}</td>
                      <td>
                        <div class="row-actions">
                          <button class="ghost-btn" type="button" @click="editAttraction(attraction)">编辑</button>
                          <button
                            v-if="attraction.isActive"
                            class="danger-btn"
                            type="button"
                            :disabled="adminLoading"
                            @click="setAttractionStatus(attraction, false)"
                          >
                            停用
                          </button>
                          <button
                            v-else
                            class="ghost-btn"
                            type="button"
                            :disabled="adminLoading"
                            @click="setAttractionStatus(attraction, true)"
                          >
                            启用
                          </button>
                          <button class="danger-btn" type="button" :disabled="adminLoading" @click="deleteAttraction(attraction)">
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!adminLoading && adminAttractions.length === 0">
                      <td colspan="7">暂无景点。</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="showAttractionDialog" class="modal-backdrop" @click.self="closeAttractionDialog">
                <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="attractionDialogTitle">
                  <div class="modal-head">
                    <div>
                      <h2 id="attractionDialogTitle">{{ editingAttractionId ? '修改景点' : '新增景点' }}</h2>
                      <p>录入景点基础信息后保存，系统会返回景点管理主页。</p>
                    </div>
                    <button class="ghost-btn" type="button" @click="closeAttractionDialog">关闭</button>
                  </div>

                  <p v-if="adminError" class="form-error">{{ adminError }}</p>

                  <form class="admin-form-grid" @submit.prevent="saveAttraction">
                    <label>
                      <span class="required-label">景点 ID</span>
                      <input
                        v-model="attractionForm.id"
                        type="text"
                        :disabled="Boolean(editingAttractionId)"
                        aria-required="true"
                      />
                    </label>
                    <label>
                      <span class="required-label">景点名称</span>
                      <input v-model="attractionForm.name" type="text" aria-required="true" />
                    </label>
                    <label>
                      <span>地区</span>
                      <select v-model="attractionForm.regionId">
                        <option value="">选择地区</option>
                        <option v-for="region in adminRegions" :key="region.id" :value="region.id">
                          {{ region.name }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>省份</span>
                      <input v-model="attractionForm.province" type="text" />
                    </label>
                    <label>
                      <span>城市</span>
                      <input v-model="attractionForm.city" type="text" />
                    </label>
                    <label>
                      <span>建议时长</span>
                      <input v-model="attractionForm.suggestedDuration" type="text" />
                    </label>
                    <label>
                      <span>热度</span>
                      <input v-model.number="attractionForm.popularityScore" type="number" min="0" max="100" />
                    </label>
                    <label>
                      <span>适合月份</span>
                      <input v-model="attractionForm.bestMonthsText" type="text" placeholder="4, 5, 9, 10" />
                    </label>
                    <label class="span-2">
                      <span>类型</span>
                      <input v-model="attractionForm.categoriesText" type="text" placeholder="历史文化, 世界遗产" />
                    </label>
                    <label class="span-2">
                      <span>适合人群</span>
                      <input v-model="attractionForm.audienceTagsText" type="text" placeholder="亲子家庭, 摄影爱好者" />
                    </label>
                    <label class="span-2">
                      <span>地址</span>
                      <input v-model="attractionForm.address" type="text" />
                    </label>
                    <label class="span-2">
                      <span>预算参考</span>
                      <input v-model="attractionForm.budget" type="text" />
                    </label>
                    <label class="span-2">
                      <span>封面图</span>
                      <input v-model="attractionForm.coverImage" type="text" />
                    </label>
                    <label class="span-2">
                      <span>简介</span>
                      <textarea v-model="attractionForm.summary" rows="3"></textarea>
                    </label>
                    <label class="span-2">
                      <span>出行时间</span>
                      <textarea v-model="attractionForm.travelTimeTips" rows="3"></textarea>
                    </label>
                    <label>
                      <span>飞机到达</span>
                      <textarea v-model="attractionForm.transportationPlane" rows="3"></textarea>
                    </label>
                    <label>
                      <span>高铁/火车</span>
                      <textarea v-model="attractionForm.transportationRail" rows="3"></textarea>
                    </label>
                    <label>
                      <span>市内交通</span>
                      <textarea v-model="attractionForm.transportationLocal" rows="3"></textarea>
                    </label>
                    <label>
                      <span>自驾</span>
                      <textarea v-model="attractionForm.transportationSelfDrive" rows="3"></textarea>
                    </label>
                    <label class="span-2">
                      <span>推荐路线</span>
                      <textarea v-model="attractionForm.routeTipsText" rows="3" placeholder="用英文逗号分隔"></textarea>
                    </label>
                    <label class="span-2">
                      <span>必看亮点</span>
                      <input v-model="attractionForm.highlightsText" type="text" placeholder="用英文逗号分隔" />
                    </label>
                    <label class="span-2">
                      <span>注意事项</span>
                      <textarea v-model="attractionForm.noticesText" rows="3" placeholder="用英文逗号分隔"></textarea>
                    </label>
                    <label class="span-2">
                      <span>周边推荐</span>
                      <input v-model="attractionForm.nearbyText" type="text" placeholder="用英文逗号分隔" />
                    </label>
                    <div class="admin-form-actions span-2">
                      <button class="primary-btn" type="submit" :disabled="adminLoading">保存</button>
                      <button class="ghost-btn" type="button" @click="closeAttractionDialog">取消</button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div v-else class="empty-state">
          <h1>没有后台权限</h1>
          <button class="primary-btn" type="button" @click="navigate('/login')">登录管理员账号</button>
        </div>
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
