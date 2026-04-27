# Trip Guide

A small travel guide project for collecting destination notes, itinerary ideas, and practical trip-planning tips.

## Getting Started

Use this repository as a home base for trip research, routes, packing notes, and recommendations.

## MySQL Setup

The app stores registered users in a MySQL database named `trip`. Copy `.env.example` to `.env`, then fill in your local MySQL credentials:

```bash
cp .env.example .env
```

Required variables:

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=trip
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin1234
```

Start the app with:

```bash
npm run dev
```

On startup, the server creates the `trip` database plus the `users` and `attractions` tables if they do not already exist. Register writes to `trip.users`; login checks the entered username/email and password against that table. The existing attraction basics from `src/data/attractions.js` are upserted into `trip.attractions` each time the server starts.

If `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are set, startup creates or updates that account as an active administrator. Admin users can open `/admin` after login to view registered users, reset passwords, and disable or enable accounts. The admin sidebar also includes `系统管理 > 地区`, where admins can manage records in `trip.regions`, and `旅游 > 景点管理`, where admins can add, edit, delete, disable, and enable attraction records in `trip.attractions`.
