CREATE DATABASE IF NOT EXISTS `trip`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `trip`;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS regions (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_attractions_region_id (region_id),
  INDEX idx_attractions_city (city),
  INDEX idx_attractions_popularity (popularity_score),
  CONSTRAINT fk_attractions_region
    FOREIGN KEY (region_id) REFERENCES regions(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
