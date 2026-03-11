# 🗺️ Attendance Backend - GPS Geofencing System

Smart field worker attendance system built with NestJS, PostgreSQL, Redis, and WebSocket.

## 🏗️ Architecture

```
attendance-backend/
├── src/
│   ├── main.ts                          # App bootstrap
│   ├── app.module.ts                    # Root module
│   ├── prisma/                          # Database ORM
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── redis/                           # Caching layer
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── gateway/                         # WebSocket (real-time)
│   │   ├── gateway.module.ts
│   │   └── attendance.gateway.ts       # 🔌 Socket.IO Gateway
│   ├── scheduler/                       # Cron jobs
│   │   ├── scheduler.module.ts
│   │   └── scheduler.service.ts        # ⏰ Auto-absent & cache cleanup
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   │   ├── response.interceptor.ts  # Standardized API response
│   │   │   └── logging.interceptor.ts
│   │   └── utils/
│   │       └── geofence.util.ts        # 📍 Haversine GPS engine
│   └── modules/
│       ├── auth/                        # JWT Auth + Refresh Token
│       ├── users/                       # Employee management
│       ├── attendance/                  # Check-in/out core
│       ├── location/                    # Geofence locations
│       ├── dashboard/                   # Admin analytics
│       ├── leaves/                      # Leave management
│       └── reports/                     # CSV exports
├── prisma/
│   ├── schema.prisma                    # Database schema
│   └── seed.ts                          # Initial data
├── docker-compose.yml
└── Dockerfile
```

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
cp .env.example .env
docker-compose up -d
docker-compose exec backend npx prisma migrate dev
docker-compose exec backend npx prisma db seed
```

### Option 2: Manual
```bash
# 1. Install dependencies
npm install

# 2. Setup .env
cp .env.example .env
# Edit DATABASE_URL and other configs

# 3. Run migrations & seed
npx prisma migrate dev
npx prisma db seed

# 4. Start dev server
npm run start:dev
```

App runs at: `http://localhost:3001/api/v1`  
Swagger docs: `http://localhost:3001/api/docs`

## 🔑 Default Credentials (after seed)

| Role        | Email                   | Password   |
|-------------|-------------------------|------------|
| Super Admin | admin@demo.co.id        | Admin@123  |
| Supervisor  | supervisor@demo.co.id   | Admin@123  |
| Employee    | ahmad@demo.co.id        | Admin@123  |

## 📡 API Endpoints

### Auth
| Method | Endpoint              | Description          |
|--------|-----------------------|----------------------|
| POST   | /auth/login           | Login                |
| POST   | /auth/refresh         | Refresh token        |
| POST   | /auth/logout          | Logout               |
| GET    | /auth/me              | Current user         |
| PATCH  | /auth/change-password | Change password      |

### Attendance
| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| POST   | /attendance/check-in        | GPS check-in             |
| POST   | /attendance/check-out       | GPS check-out            |
| GET    | /attendance/today           | Today's status           |
| GET    | /attendance/my-history      | Personal history         |
| GET    | /attendance/all             | [Admin] All attendances  |
| GET    | /attendance/live-tracking   | [Admin] Live overview    |

### Dashboard (Admin)
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| GET    | /dashboard/overview       | Stats overview        |
| GET    | /dashboard/trend          | Attendance trend      |
| GET    | /dashboard/leaderboard    | Top performers        |

### Location
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| POST   | /locations                | Create geofence       |
| GET    | /locations                | List locations        |
| GET    | /locations/check-range    | Check GPS in range?   |
| PUT    | /locations/:id            | Update location       |

### Users
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| POST   | /users                    | Create employee       |
| GET    | /users                    | List employees        |
| PUT    | /users/:id                | Update employee       |
| PATCH  | /users/:id/toggle-active  | Activate/deactivate   |

### Reports
| Method | Endpoint                     | Description           |
|--------|------------------------------|-----------------------|
| GET    | /reports/monthly-summary     | Monthly report        |
| GET    | /reports/export/csv          | Export CSV            |

## 🔌 WebSocket Events

Connect to: `ws://localhost:3001/attendance`

```js
const socket = io('http://localhost:3001/attendance', {
  auth: { token: 'your-jwt-token' }
});

// Listen for real-time check-in/out events
socket.on('attendance:update', (data) => console.log(data));

// Live field tracking (employee sends location)
socket.emit('location:update', { latitude, longitude, accuracy });

// Admin: track specific user
socket.emit('track:user', { targetUserId: 'user-id' });
socket.on('user:location', (data) => console.log(data));
```

## 🗺️ GPS Geofencing Logic

```
1. Employee sends GPS coordinates + accuracy
2. System runs anti-spoofing checks
3. Haversine formula calculates distance to all assigned locations
4. Find nearest location
5. Compare distance vs. radius (+ accuracy tolerance)
6. Accept/reject check-in with detailed message
```

**Anti-spoofing checks:**
- Detects unrealistically round coordinates
- Flags GPS accuracy < 1m (impossible)
- Validates coordinate ranges

## ⏰ Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Auto-absent | Mon-Fri 12:00 WIB | Mark absent if no check-in |
| Cache clear | Every 5 min | Invalidate dashboard cache |
| Heartbeat | Every 30 min | Log WS connections |

## 🛡️ Security Features

- JWT Access Token (15 min) + Refresh Token (7 days) in Redis
- Rate limiting: 100 req/min globally, 5 login attempts/min
- Bcrypt password hashing (cost 12)
- Helmet.js HTTP security headers
- Role-based access control (SUPER_ADMIN, ADMIN, SUPERVISOR, EMPLOYEE)
- GPS mock detection

## 📊 Database Schema

Key relationships:
```
Company ──< Location ──< UserLocation >── User
Company ──< User ──< Attendance
Company ──< Shift
User ──< Attendance
User ──< LeaveRequest
```
