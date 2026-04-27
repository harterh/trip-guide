import crypto from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import mysql from 'mysql2/promise'
import { attractions, regions as defaultRegions } from '../src/data/attractions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

loadEnvFile(path.join(rootDir, '.env'))

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 8082)
const dbName = process.env.DB_NAME || 'trip'

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
}

const app = express()
app.use(express.json({ limit: '1mb' }))

let pool

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at
  }
}

function publicAdminUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at
  }
}

function publicAdminAttraction(attraction) {
  return {
    id: attraction.id,
    name: attraction.name,
    regionId: attraction.region_id,
    region: attraction.region_name || '',
    province: attraction.province,
    city: attraction.city,
    address: attraction.address,
    summary: attraction.summary,
    categories: parseStoredList(attraction.categories),
    audienceTags: parseStoredList(attraction.audience_tags),
    suggestedDuration: attraction.suggested_duration,
    bestMonths: parseStoredList(attraction.best_months),
    budget: attraction.budget,
    popularityScore: attraction.popularity_score,
    coverImage: attraction.cover_image,
    travelTimeTips: attraction.travel_time_tips || '',
    transportation: parseStoredObject(attraction.transportation),
    routeTips: parseStoredList(attraction.route_tips),
    highlights: parseStoredList(attraction.highlights),
    notices: parseStoredList(attraction.notices),
    nearby: parseStoredList(attraction.nearby),
    isActive: Boolean(attraction.is_active),
    createdAt: attraction.created_at instanceof Date ? attraction.created_at.toISOString() : attraction.created_at,
    updatedAt: attraction.updated_at instanceof Date ? attraction.updated_at.toISOString() : attraction.updated_at
  }
}

function publicAdminRegion(region) {
  return {
    id: region.id,
    name: region.name,
    isActive: Boolean(region.is_active),
    createdAt: region.created_at instanceof Date ? region.created_at.toISOString() : region.created_at,
    updatedAt: region.updated_at instanceof Date ? region.updated_at.toISOString() : region.updated_at
  }
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')
  return `pbkdf2_sha256$120000$${salt}$${hash}`
}

function verifyPassword(password, passwordHash) {
  const [algorithm, iterationsText, salt, storedHash] = String(passwordHash).split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterationsText || !salt || !storedHash) return false

  const hash = crypto
    .pbkdf2Sync(password, salt, Number(iterationsText), Buffer.from(storedHash, 'hex').length, 'sha256')
    .toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}

function serializeList(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function parseStoredList(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseStoredObject(value) {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeAttractionPayload(data, options = {}) {
  const transportation = {
    plane: String(data.transportation?.plane || data.transportationPlane || '').trim(),
    rail: String(data.transportation?.rail || data.transportationRail || '').trim(),
    local: String(data.transportation?.local || data.transportationLocal || '').trim(),
    selfDrive: String(data.transportation?.selfDrive || data.transportationSelfDrive || '').trim()
  }

  const payload = {
    id: String(data.id || '').trim(),
    name: String(data.name || '').trim(),
    regionId: String(data.regionId || data.region || '').trim(),
    province: String(data.province || '').trim(),
    city: String(data.city || '').trim(),
    address: String(data.address || '').trim(),
    summary: String(data.summary || '').trim(),
    categories: normalizeList(data.categories),
    audienceTags: normalizeList(data.audienceTags),
    suggestedDuration: String(data.suggestedDuration || '').trim(),
    bestMonths: normalizeList(data.bestMonths)
      .map((month) => Number.parseInt(month, 10))
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    budget: String(data.budget || '').trim(),
    popularityScore:
      data.popularityScore === undefined || data.popularityScore === '' || data.popularityScore === null
        ? null
        : Number.parseInt(data.popularityScore, 10),
    coverImage: String(data.coverImage || '').trim(),
    travelTimeTips: String(data.travelTimeTips || '').trim(),
    transportation: Object.fromEntries(Object.entries(transportation).filter(([, value]) => value)),
    routeTips: normalizeList(data.routeTips),
    highlights: normalizeList(data.highlights),
    notices: normalizeList(data.notices),
    nearby: normalizeList(data.nearby)
  }

  if (!options.existingId && !payload.id) {
    return { error: '请填写景点 ID。' }
  }

  if (!options.existingId && !/^[a-z0-9-]{2,80}$/.test(payload.id)) {
    return { error: '景点 ID 需为 2-80 个小写字母、数字或连字符。' }
  }

  if (!payload.name) {
    return { error: '请填写景点名称。' }
  }

  if (
    payload.popularityScore !== null &&
    (!Number.isInteger(payload.popularityScore) || payload.popularityScore < 0 || payload.popularityScore > 100)
  ) {
    return { error: '热度需为 0-100 的整数。' }
  }

  return { payload }
}

async function resolveRegion(regionIdOrName) {
  const value = String(regionIdOrName || '').trim()
  if (!value) return { id: null, name: null }

  const [rows] = await pool.execute(
    `SELECT id, name
      FROM regions
      WHERE id = :value OR name = :value
      LIMIT 1`,
    { value }
  )

  return rows[0] ? { id: rows[0].id, name: rows[0].name } : null
}

async function loadActiveRegions() {
  const [rows] = await pool.execute(
    `SELECT id, name, is_active, created_at, updated_at
      FROM regions
      WHERE is_active = 1
      ORDER BY created_at ASC`
  )
  return rows.map(publicAdminRegion)
}

function normalizeRegionPayload(data, options = {}) {
  const payload = {
    id: String(data.id || '').trim(),
    name: String(data.name || '').trim()
  }

  if (!options.existingId && !payload.id) {
    return { error: '请填写地区 ID。' }
  }

  if (!options.existingId && !/^[a-z0-9-]{2,80}$/.test(payload.id)) {
    return { error: '地区 ID 需为 2-80 个小写字母、数字或连字符。' }
  }

  if (!payload.name) {
    return { error: '请填写地区名称。' }
  }

  return { payload }
}

async function initDatabase() {
  const bootstrap = await mysql.createConnection(dbConfig)
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\`
      DEFAULT CHARACTER SET utf8mb4
      DEFAULT COLLATE utf8mb4_unicode_ci`
  )
  await bootstrap.end()

  pool = mysql.createPool({ ...dbConfig, database: dbName })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      username VARCHAR(20) NOT NULL UNIQUE,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NOT NULL,
      role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await ensureColumn('users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS regions (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await seedRegions()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attractions (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      region_id VARCHAR(80) NULL,
      province VARCHAR(40) NULL,
      city VARCHAR(80) NULL,
      address VARCHAR(255) NULL,
      summary VARCHAR(500) NULL,
      categories TEXT NULL,
      audience_tags TEXT NULL,
      suggested_duration VARCHAR(40) NULL,
      best_months TEXT NULL,
      budget VARCHAR(255) NULL,
      popularity_score INT NULL,
      cover_image VARCHAR(500) NULL,
      travel_time_tips TEXT NULL,
      transportation TEXT NULL,
      route_tips TEXT NULL,
      highlights TEXT NULL,
      notices TEXT NULL,
      nearby TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_attractions_city (city),
      INDEX idx_attractions_popularity (popularity_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await ensureColumn('attractions', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1')
  await ensureColumn('attractions', 'region_id', 'VARCHAR(80) NULL')
  await ensureColumn('attractions', 'travel_time_tips', 'TEXT NULL')
  await ensureColumn('attractions', 'transportation', 'TEXT NULL')
  await ensureColumn('attractions', 'route_tips', 'TEXT NULL')
  await ensureColumn('attractions', 'highlights', 'TEXT NULL')
  await ensureColumn('attractions', 'notices', 'TEXT NULL')
  await ensureColumn('attractions', 'nearby', 'TEXT NULL')
  await makeAttractionColumnsNullable()
  await migrateAttractionRegions()
  await dropIndexIfExists('attractions', 'idx_attractions_region')
  await dropColumnIfExists('attractions', 'region')
  await ensureIndex('attractions', 'idx_attractions_region_id', 'region_id')
  await ensureForeignKey(
    'attractions',
    'fk_attractions_region',
    'region_id',
    'regions',
    'id',
    'ON UPDATE CASCADE ON DELETE SET NULL'
  )

  await seedAttractions()
  await seedAdminUser()
}

async function makeAttractionColumnsNullable() {
  await pool.query(`
    ALTER TABLE attractions
      MODIFY region_id VARCHAR(80) NULL,
      MODIFY province VARCHAR(40) NULL,
      MODIFY city VARCHAR(80) NULL,
      MODIFY address VARCHAR(255) NULL,
      MODIFY summary VARCHAR(500) NULL,
      MODIFY categories TEXT NULL,
      MODIFY audience_tags TEXT NULL,
      MODIFY suggested_duration VARCHAR(40) NULL,
      MODIFY best_months TEXT NULL,
      MODIFY budget VARCHAR(255) NULL,
      MODIFY popularity_score INT NULL,
      MODIFY cover_image VARCHAR(500) NULL,
      MODIFY travel_time_tips TEXT NULL,
      MODIFY transportation TEXT NULL,
      MODIFY route_tips TEXT NULL,
      MODIFY highlights TEXT NULL,
      MODIFY notices TEXT NULL,
      MODIFY nearby TEXT NULL
  `)
}

async function migrateAttractionRegions() {
  if (await columnExists('attractions', 'region')) {
    await pool.query(`
      UPDATE attractions a
      LEFT JOIN regions r ON a.region = r.name
      SET a.region_id = COALESCE(a.region_id, r.id)
      WHERE a.region_id IS NULL
        AND a.region IS NOT NULL
        AND a.region <> ''
    `)
  }

  await pool.query(`
    UPDATE attractions a
    INNER JOIN regions r ON a.region_id = r.name
    SET a.region_id = r.id
  `)

  await pool.query(`
    UPDATE attractions a
    LEFT JOIN regions r ON a.region_id = r.id
    SET a.region_id = NULL
    WHERE a.region_id IS NOT NULL
      AND r.id IS NULL
  `)
}

async function ensureColumn(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) return

  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`)
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = :schemaName
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
      LIMIT 1`,
    { schemaName: dbName, tableName, columnName }
  )

  return rows.length > 0
}

async function dropColumnIfExists(tableName, columnName) {
  if (await columnExists(tableName, columnName)) {
    await pool.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``)
  }
}

async function ensureIndex(tableName, indexName, columnName) {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = :schemaName
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
      LIMIT 1`,
    { schemaName: dbName, tableName, indexName }
  )

  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (\`${columnName}\`)`)
  }
}

async function dropIndexIfExists(tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = :schemaName
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
      LIMIT 1`,
    { schemaName: dbName, tableName, indexName }
  )

  if (rows.length) {
    await pool.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``)
  }
}

async function ensureForeignKey(tableName, constraintName, columnName, referencedTable, referencedColumn, actionClause) {
  const [rows] = await pool.execute(
    `SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = :schemaName
        AND TABLE_NAME = :tableName
        AND CONSTRAINT_NAME = :constraintName
      LIMIT 1`,
    { schemaName: dbName, tableName, constraintName }
  )

  if (!rows.length) {
    await pool.query(
      `ALTER TABLE \`${tableName}\`
        ADD CONSTRAINT \`${constraintName}\`
        FOREIGN KEY (\`${columnName}\`) REFERENCES \`${referencedTable}\`(\`${referencedColumn}\`)
        ${actionClause}`
    )
  }
}

async function seedAdminUser() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''

  if (!username || !email || !password) return

  if (!/^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn('ADMIN_USERNAME 或 ADMIN_EMAIL 格式不正确，已跳过管理员初始化。')
    return
  }

  if (!validatePassword(password)) {
    console.warn('ADMIN_PASSWORD 至少 8 位且包含字母和数字，已跳过管理员初始化。')
    return
  }

  const [existing] = await pool.execute('SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1', {
    username,
    email
  })

  if (existing.length) {
    await pool.execute(
      `UPDATE users
        SET role = 'admin',
          is_active = 1,
          password_hash = :passwordHash
        WHERE id = :id`,
      { id: existing[0].id, passwordHash: hashPassword(password) }
    )
    return
  }

  await pool.execute(
    `INSERT INTO users (id, username, email, password_hash, role, is_active)
      VALUES (:id, :username, :email, :passwordHash, 'admin', 1)`,
    { id: crypto.randomUUID(), username, email, passwordHash: hashPassword(password) }
  )
}

async function seedAttractions() {
  for (const attraction of attractions) {
    const region = await resolveRegion(attraction.region)
    await pool.execute(
      `INSERT INTO attractions (
        id,
        name,
        region_id,
        province,
        city,
        address,
        summary,
        categories,
        audience_tags,
        suggested_duration,
        best_months,
        budget,
        popularity_score,
        cover_image,
        travel_time_tips,
        transportation,
        route_tips,
        highlights,
        notices,
        nearby
      ) VALUES (
        :id,
        :name,
        :regionId,
        :province,
        :city,
        :address,
        :summary,
        :categories,
        :audienceTags,
        :suggestedDuration,
        :bestMonths,
        :budget,
        :popularityScore,
        :coverImage,
        :travelTimeTips,
        :transportation,
        :routeTips,
        :highlights,
        :notices,
        :nearby
      )
      ON DUPLICATE KEY UPDATE
        region_id = COALESCE(region_id, VALUES(region_id)),
        province = COALESCE(NULLIF(province, ''), VALUES(province)),
        city = COALESCE(NULLIF(city, ''), VALUES(city)),
        address = COALESCE(NULLIF(address, ''), VALUES(address)),
        summary = COALESCE(NULLIF(summary, ''), VALUES(summary)),
        categories = COALESCE(NULLIF(categories, '[]'), VALUES(categories)),
        audience_tags = COALESCE(NULLIF(audience_tags, '[]'), VALUES(audience_tags)),
        suggested_duration = COALESCE(NULLIF(suggested_duration, ''), VALUES(suggested_duration)),
        best_months = COALESCE(NULLIF(best_months, '[]'), VALUES(best_months)),
        budget = COALESCE(NULLIF(budget, ''), VALUES(budget)),
        popularity_score = COALESCE(popularity_score, VALUES(popularity_score)),
        cover_image = COALESCE(NULLIF(cover_image, ''), VALUES(cover_image)),
        travel_time_tips = COALESCE(NULLIF(travel_time_tips, ''), VALUES(travel_time_tips)),
        transportation = COALESCE(NULLIF(transportation, '{}'), VALUES(transportation)),
        route_tips = COALESCE(NULLIF(route_tips, '[]'), VALUES(route_tips)),
        highlights = COALESCE(NULLIF(highlights, '[]'), VALUES(highlights)),
        notices = COALESCE(NULLIF(notices, '[]'), VALUES(notices)),
        nearby = COALESCE(NULLIF(nearby, '[]'), VALUES(nearby))`,
      {
        id: attraction.id,
        name: attraction.name,
        regionId: region?.id || null,
        province: attraction.province,
        city: attraction.city,
        address: attraction.address,
        summary: attraction.summary,
        categories: serializeList(attraction.categories),
        audienceTags: serializeList(attraction.audienceTags),
        suggestedDuration: attraction.suggestedDuration,
        bestMonths: serializeList(attraction.bestMonths),
        budget: attraction.budget,
        popularityScore: attraction.popularityScore,
        coverImage: attraction.coverImage,
        travelTimeTips: attraction.travelTimeTips || '',
        transportation: JSON.stringify(attraction.transportation || {}),
        routeTips: serializeList(attraction.routeTips),
        highlights: serializeList(attraction.highlights),
        notices: serializeList(attraction.notices),
        nearby: serializeList(attraction.nearby)
      }
    )
  }
}

async function seedRegions() {
  const [existing] = await pool.query('SELECT COUNT(*) AS total FROM regions')
  if (existing[0].total > 0) return

  const ids = ['huabei', 'huadong', 'huazhong', 'huanan', 'xinan', 'xibei']
  for (const [index, name] of defaultRegions.entries()) {
    await pool.execute('INSERT INTO regions (id, name) VALUES (:id, :name)', {
      id: ids[index] || `region-${index + 1}`,
      name
    })
  }
}

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')

    if (!/^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ message: '用户名需为 3-20 个字符，可包含中文、英文、数字和下划线。' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '请输入有效邮箱。' })
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ message: '密码至少 8 位，且包含字母和数字。' })
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1',
      { username, email }
    )
    if (existing.length) {
      return res.status(409).json({ message: '用户名或邮箱不可用。' })
    }

    const id = crypto.randomUUID()
    await pool.execute(
      `INSERT INTO users (id, username, email, password_hash)
        VALUES (:id, :username, :email, :passwordHash)`,
      { id, username, email, passwordHash: hashPassword(password) }
    )

    const [rows] = await pool.execute('SELECT id, username, email, role, is_active, created_at FROM users WHERE id = :id', {
      id
    })
    return res.status(201).json({ user: publicUser(rows[0]) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim()
    const password = String(req.body.password || '')

    if (!identifier || !password) {
      return res.status(400).json({ message: '请输入用户名或邮箱和密码。' })
    }

    const [rows] = await pool.execute(
      `SELECT id, username, email, password_hash, role, is_active, created_at
        FROM users
        WHERE username = :identifier OR email = :email
        LIMIT 1`,
      { identifier, email: identifier.toLowerCase() }
    )
    const user = rows[0]

    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: '用户名或密码错误。' })
    }

    return res.json({ user: publicUser(user) })
  } catch (error) {
    next(error)
  }
})

async function requireAdmin(req, res, next) {
  try {
    const adminId = String(req.get('x-user-id') || '').trim()
    if (!adminId) {
      return res.status(401).json({ message: '请先登录管理员账号。' })
    }

    const [rows] = await pool.execute('SELECT id, role, is_active FROM users WHERE id = :adminId LIMIT 1', { adminId })
    const admin = rows[0]
    if (!admin || admin.role !== 'admin' || !admin.is_active) {
      return res.status(403).json({ message: '当前账号没有后台管理权限。' })
    }

    req.admin = admin
    next()
  } catch (error) {
    next(error)
  }
}

app.get('/api/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, username, email, role, is_active, created_at
        FROM users
        ORDER BY created_at DESC`
    )
    return res.json({ users: rows.map(publicAdminUser) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/users/:id/password', requireAdmin, async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim()
    const password = String(req.body.password || '')

    if (!validatePassword(password)) {
      return res.status(400).json({ message: '新密码至少 8 位，且包含字母和数字。' })
    }

    const [result] = await pool.execute('UPDATE users SET password_hash = :passwordHash WHERE id = :userId', {
      userId,
      passwordHash: hashPassword(password)
    })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '用户不存在。' })
    }

    return res.json({ message: '用户密码已重置。' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/users/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim()
    const isActive = Boolean(req.body.isActive)

    if (userId === req.admin.id && !isActive) {
      return res.status(400).json({ message: '不能停用当前登录的管理员账号。' })
    }

    const [result] = await pool.execute('UPDATE users SET is_active = :isActive WHERE id = :userId', {
      userId,
      isActive: isActive ? 1 : 0
    })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '用户不存在。' })
    }

    return res.json({ message: isActive ? '用户已启用。' : '用户已停用。' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/attractions', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.region_id, r.name AS region_name, a.province, a.city, a.address,
          a.summary, a.categories, a.audience_tags, a.suggested_duration, a.best_months, a.budget,
          a.popularity_score, a.cover_image, a.travel_time_tips, a.transportation, a.route_tips,
          a.highlights, a.notices, a.nearby, a.is_active, a.created_at, a.updated_at
        FROM attractions a
        LEFT JOIN regions r ON a.region_id = r.id
        WHERE a.is_active = 1
        ORDER BY a.popularity_score DESC, a.updated_at DESC`
    )
    return res.json({ attractions: rows.map(publicAdminAttraction) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/regions', async (req, res, next) => {
  try {
    return res.json({ regions: await loadActiveRegions() })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/attractions', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.region_id, r.name AS region_name, a.province, a.city, a.address,
          a.summary, a.categories, a.audience_tags, a.suggested_duration, a.best_months, a.budget,
          a.popularity_score, a.cover_image, a.travel_time_tips, a.transportation, a.route_tips,
          a.highlights, a.notices, a.nearby, a.is_active, a.created_at, a.updated_at
        FROM attractions a
        LEFT JOIN regions r ON a.region_id = r.id
        ORDER BY a.popularity_score DESC, a.updated_at DESC`
    )
    return res.json({ attractions: rows.map(publicAdminAttraction) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/attractions', requireAdmin, async (req, res, next) => {
  try {
    const { payload, error } = normalizeAttractionPayload(req.body)
    if (error) return res.status(400).json({ message: error })

    const [existing] = await pool.execute('SELECT id FROM attractions WHERE id = :id LIMIT 1', { id: payload.id })
    if (existing.length) {
      return res.status(409).json({ message: '景点 ID 已存在。' })
    }

    const region = await resolveRegion(payload.regionId)
    if (payload.regionId && !region) {
      return res.status(400).json({ message: '请选择有效地区。' })
    }

    await pool.execute(
      `INSERT INTO attractions (
        id, name, region_id, province, city, address, summary, categories, audience_tags,
        suggested_duration, best_months, budget, popularity_score, cover_image, travel_time_tips,
        transportation, route_tips, highlights, notices, nearby, is_active
      ) VALUES (
        :id, :name, :regionId, :province, :city, :address, :summary, :categories, :audienceTags,
        :suggestedDuration, :bestMonths, :budget, :popularityScore, :coverImage, :travelTimeTips,
        :transportation, :routeTips, :highlights, :notices, :nearby, 1
      )`,
      {
        ...payload,
        regionId: region?.id || null,
        categories: serializeList(payload.categories),
        audienceTags: serializeList(payload.audienceTags),
        bestMonths: serializeList(payload.bestMonths),
        transportation: JSON.stringify(payload.transportation),
        routeTips: serializeList(payload.routeTips),
        highlights: serializeList(payload.highlights),
        notices: serializeList(payload.notices),
        nearby: serializeList(payload.nearby)
      }
    )

    return res.status(201).json({ message: '景点已新增。' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/attractions/:id', requireAdmin, async (req, res, next) => {
  try {
    const attractionId = String(req.params.id || '').trim()
    const { payload, error } = normalizeAttractionPayload({ ...req.body, id: attractionId }, { existingId: true })
    if (error) return res.status(400).json({ message: error })

    const region = await resolveRegion(payload.regionId)
    if (payload.regionId && !region) {
      return res.status(400).json({ message: '请选择有效地区。' })
    }

    const [result] = await pool.execute(
      `UPDATE attractions
        SET name = :name,
          region_id = :regionId,
          province = :province,
          city = :city,
          address = :address,
          summary = :summary,
          categories = :categories,
          audience_tags = :audienceTags,
          suggested_duration = :suggestedDuration,
          best_months = :bestMonths,
          budget = :budget,
          popularity_score = :popularityScore,
          cover_image = :coverImage,
          travel_time_tips = :travelTimeTips,
          transportation = :transportation,
          route_tips = :routeTips,
          highlights = :highlights,
          notices = :notices,
          nearby = :nearby
        WHERE id = :id`,
      {
        ...payload,
        id: attractionId,
        regionId: region?.id || null,
        categories: serializeList(payload.categories),
        audienceTags: serializeList(payload.audienceTags),
        bestMonths: serializeList(payload.bestMonths),
        transportation: JSON.stringify(payload.transportation),
        routeTips: serializeList(payload.routeTips),
        highlights: serializeList(payload.highlights),
        notices: serializeList(payload.notices),
        nearby: serializeList(payload.nearby)
      }
    )

    if (!result.affectedRows) {
      return res.status(404).json({ message: '景点不存在。' })
    }

    return res.json({ message: '景点已更新。' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/attractions/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const attractionId = String(req.params.id || '').trim()
    const isActive = Boolean(req.body.isActive)
    const [result] = await pool.execute('UPDATE attractions SET is_active = :isActive WHERE id = :attractionId', {
      attractionId,
      isActive: isActive ? 1 : 0
    })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '景点不存在。' })
    }

    return res.json({ message: isActive ? '景点已启用。' : '景点已停用。' })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/attractions/:id', requireAdmin, async (req, res, next) => {
  try {
    const attractionId = String(req.params.id || '').trim()
    const [result] = await pool.execute('DELETE FROM attractions WHERE id = :attractionId', { attractionId })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '景点不存在。' })
    }

    return res.json({ message: '景点已删除。' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/regions', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, is_active, created_at, updated_at
        FROM regions
        ORDER BY created_at DESC`
    )
    return res.json({ regions: rows.map(publicAdminRegion) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/regions', requireAdmin, async (req, res, next) => {
  try {
    const { payload, error } = normalizeRegionPayload(req.body)
    if (error) return res.status(400).json({ message: error })

    const [existing] = await pool.execute('SELECT id FROM regions WHERE id = :id OR name = :name LIMIT 1', payload)
    if (existing.length) {
      return res.status(409).json({ message: '地区 ID 或地区名称已存在。' })
    }

    await pool.execute('INSERT INTO regions (id, name, is_active) VALUES (:id, :name, 1)', payload)
    return res.status(201).json({ message: '地区已新增。' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/regions/:id', requireAdmin, async (req, res, next) => {
  try {
    const regionId = String(req.params.id || '').trim()
    const { payload, error } = normalizeRegionPayload({ ...req.body, id: regionId }, { existingId: true })
    if (error) return res.status(400).json({ message: error })

    const [duplicate] = await pool.execute('SELECT id FROM regions WHERE name = :name AND id <> :id LIMIT 1', {
      id: regionId,
      name: payload.name
    })
    if (duplicate.length) {
      return res.status(409).json({ message: '地区名称已存在。' })
    }

    const [result] = await pool.execute('UPDATE regions SET name = :name WHERE id = :id', {
      id: regionId,
      name: payload.name
    })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '地区不存在。' })
    }

    return res.json({ message: '地区已更新。' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/regions/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const regionId = String(req.params.id || '').trim()
    const isActive = Boolean(req.body.isActive)
    const [result] = await pool.execute('UPDATE regions SET is_active = :isActive WHERE id = :regionId', {
      regionId,
      isActive: isActive ? 1 : 0
    })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '地区不存在。' })
    }

    return res.json({ message: isActive ? '地区已启用。' : '地区已停用。' })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/regions/:id', requireAdmin, async (req, res, next) => {
  try {
    const regionId = String(req.params.id || '').trim()
    const [result] = await pool.execute('DELETE FROM regions WHERE id = :regionId', { regionId })

    if (!result.affectedRows) {
      return res.status(404).json({ message: '地区不存在。' })
    }

    return res.json({ message: '地区已删除。' })
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ message: '服务暂时不可用，请稍后再试。' })
})

if (isProduction) {
  app.use(express.static(path.join(rootDir, 'dist')))
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(rootDir, 'dist', 'index.html'))
  })
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: 'spa'
  })
  app.use(vite.middlewares)
}

try {
  await initDatabase()
  app.listen(port, '0.0.0.0', () => {
    console.log(`Trip Guide running at http://localhost:${port}/`)
    console.log(`MySQL database: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbName}`)
  })
} catch (error) {
  console.error('无法连接或初始化 MySQL 数据库。')
  console.error(`请确认 MySQL 已启动，并设置 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME。当前数据库名：${dbName}`)
  console.error(error.message)
  process.exit(1)
}
