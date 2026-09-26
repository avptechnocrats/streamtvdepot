# Project Overview - StreamTVDepot V2

## 🎯 Project Summary

**StreamTVDepot** is a multi-tenant SaaS platform for media content management and distribution. It enables businesses to manage their media libraries (movies, shows, content) and customize user experiences through theming and white-label capabilities. The platform supports multi-domain routing where different customer subdomains are served with customized storefronts while maintaining a centralized admin interface.

### Key Features
- **Multi-Tenant Architecture** - Isolated customer environments with shared infrastructure
- **Customizable Themes** - Dark/Gold, Neon City, and extensible theme system
- **White-Label Admin Panel** - Tenant-specific admin interfaces for content management
- **Responsive Design** - Mobile-first approach with responsive UI components
- **Real-time Sync** - Efficient API communication and React Query caching
- **Scalable Backend** - AsyncIO-based FastAPI for high concurrency
- **Database Migrations** - Alembic for version-controlled schema changes

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
┌──────────────────┐           ┌──────────────────┐
│   Frontend (Next.js)         │  Backend (FastAPI)│
│   - React 18                 │  - Async/await   │
│   - TypeScript               │  - PostgreSQL    │
│   - Tailwind CSS             │  - Redis cache   │
│   - shadcn/ui                │  - Alembic ORM   │
│   Port: 3001                 │  Port: 8001      │
└──────────────────┘           └──────────────────┘
        ↓                                ↓
   ┌────────────────────────────────────┴──────────┐
   ↓                                               ↓
┌──────────────┐                          ┌──────────────┐
│ PostgreSQL   │                          │   Redis      │
│ Port: 5433   │                          │ Port: 6379   │
└──────────────┘                          └──────────────┘
```

---

## 🛠️ Technology Stack

### Frontend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **Next.js** | React framework with SSR/SSG | 16.2.2 |
| **React** | UI library | 18.3.1 |
| **TypeScript** | Type safety | 5.8.3 |
| **Tailwind CSS** | Utility-first CSS | 3.4.17 |
| **shadcn/ui** | Component library | Latest |
| **React Hook Form** | Form management | 7.61.1 |
| **React Query** | Data fetching & caching | 5.83.0 |
| **Axios** | HTTP client | 1.14.0 |
| **next-themes** | Theme switching | 0.3.0 |
| **Zod** | TypeScript-first schema validation | 3.25.76 |
| **Vitest** | Unit testing | Latest |

### Backend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **Python** | Language | 3.11+ |
| **FastAPI** | Web framework | Latest |
| **SQLAlchemy** | ORM | 2.x |
| **Alembic** | Database migrations | Latest |
| **PostgreSQL** | Primary database | 16 |
| **asyncpg** | Async PostgreSQL driver | Latest |
| **Redis** | Cache layer | 7 |
| **Pydantic** | Data validation | 2.x |
| **Uvicorn** | ASGI server | Latest |

### DevOps
| Technology | Purpose |
|-----------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Multi-container orchestration |
| **Alembic** | Database version control |
| **Nginx** | Reverse proxy & web server |

---

## 📁 Directory Structure

```
V2/
├── Docs/                           # 📚 Documentation files
├── backend/                        # 🔧 FastAPI backend
│   ├── app/
│   │   ├── main.py               # Application entry point
│   │   ├── api/                  # API routes
│   │   ├── core/                 # Configuration, database
│   │   ├── models/               # SQLAlchemy ORM models
│   │   └── schemas/              # Pydantic request/response schemas
│   ├── alembic/                  # Database migrations
│   ├── requirements.txt           # Python dependencies
│   └── Dockerfile                # Docker image definition
├── frontend/                       # ⚛️ Next.js frontend
│   ├── app/                       # Next.js app directory
│   │   ├── page.tsx              # Home page
│   │   ├── layout.tsx            # Root layout
│   │   ├── admin/                # Admin panel routes
│   │   ├── demo/                 # Demo routes
│   │   ├── login/                # Authentication routes
│   │   └── signup/               # Registration routes
│   ├── components/               # Reusable React components
│   │   ├── ui/                   # Base UI components
│   │   └── admin/                # Admin-specific components
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-theme.tsx
│   │   ├── use-admin-auth.tsx
│   │   ├── use-user-prefs.tsx
│   │   └── use-mobile.tsx
│   ├── lib/                      # Utility functions
│   ├── themes/                   # Theme definitions & registry
│   │   ├── dark-gold/            # Dark Gold theme
│   │   ├── neon-city/            # Neon City theme
│   │   └── registry.ts           # Theme registry
│   ├── types/                    # TypeScript type definitions
│   ├── public/                   # Static assets
│   ├── tests/                    # Test files
│   └── package.json              # NPM dependencies
├── nginx/                         # 🌐 Nginx configuration
│   └── nginx.conf
├── docker-compose.yml            # Docker Compose configuration
├── .env                          # Environment variables
└── .env.example                  # Environment variables template
```

---

## 🔄 Key User Flows

### 1. Public Storefront (Client Customer)
```
Customer visits domain (e.g., kalingo.tv)
    ↓
Nginx routes to frontend
    ↓
Middleware detects customer domain
    ↓
Frontend rewrites to /site/* route
    ↓
Loads customer-specific content & theme
    ↓
Displays customized storefront
```

### 2. Admin Panel (Tenant Admin)
```
Admin visits admin.customerdomain.com
    ↓
Nginx routes to frontend
    ↓
Middleware rewrites to /admin/* route
    ↓
Authentication check
    ↓
Dashboard with tenant management tools
    ↓
Can manage content, users, themes
```

### 3. Content Display Flow
```
Frontend requests content from Backend API
    ↓
Backend validates request headers (X-Client-Domain)
    ↓
Queries database for tenant-specific content
    ↓
Checks Redis cache for frequently accessed data
    ↓
Returns JSON data
    ↓
Frontend renders with selected theme
    ↓
React Query caches results for 5 minutes
```

---

## 🎨 Theme System

The platform supports multiple customizable themes:

### Available Themes
1. **Dark Gold** - Premium dark theme with gold accents
2. **Neon City** - Modern neon-colored cyberpunk aesthetic

### Theme Configuration
- Located in: `frontend/themes/`
- Each theme includes:
  - Color palette (primary, accent, gradients)
  - Typography settings
  - Component variations
  - CSS variables

### Adding New Themes
1. Create new folder in `frontend/themes/`
2. Define theme colors and variables
3. Register in `frontend/themes/registry.ts`
4. Use `useTheme()` hook to implement

---

## 🔐 Security Considerations

### Multi-Tenant Isolation
- **Header-based Routing**: X-Client-Domain header identifies tenant
- **Database Row-Level Security**: Customers can only access their own data
- **API Validation**: All requests validated against authorized tenant
- **CORS Configuration**: Restricted to allowed origins

### Authentication
- Admin authentication required for `/admin/*` routes
- User preferences stored in localStorage (client-side)
- Session management via cookies or JWT (implementation-specific)

### Data Protection
- Environment variables for sensitive credentials
- Database credentials managed via `.env`
- API rate limiting recommended (not yet implemented)
- HTTPS enforced in production (Nginx SSL termination)

---

## 📈 Scalability Considerations

### Horizontal Scaling
- **Stateless Services**: Frontend and backend are stateless
- **Shared Database**: PostgreSQL handles concurrent connections
- **Caching Layer**: Redis reduces database load
- **Load Balancing**: Nginx distributes traffic to multiple backends

### Performance Optimizations
- **React Query Caching**: Client-side cache reduces API calls
- **Database Indexing**: Strategic indexes on tenant_id, domain, etc.
- **Lazy Loading**: Components load on demand
- **Next.js Optimization**: Image optimization, code splitting

### Database Optimization
- **Connection Pooling**: Configured via SQLAlchemy
- **Async Operations**: FastAPI async handlers for I/O
- **Query Optimization**: Indexed queries, eager loading
- **Caching Strategy**: Redis for session and frequently accessed data

---

## 📊 Data Models (High-Level)

### Key Entities
```python
Tenant (Customer Organization)
├── Domain: str (unique)
├── Name: str
├── Theme: str (dark-gold, neon-city)
├── Settings: JSON

Content (Movies/Shows)
├── Title: str
├── Description: str
├── ThumbnailURL: str
├── Tenant: ForeignKey → Tenant
├── Category: str

User (Admin/Customer)
├── Email: str
├── PasswordHash: str
├── Tenant: ForeignKey → Tenant
├── Role: str (admin, user)
└── Preferences: JSON
```

---

## 🚀 Deployment Architecture

### Development
- Local machines with Docker Desktop
- docker-compose for orchestration

### Production
- Cloud platform (AWS, GCP, Azure, etc.)
- Kubernetes or Docker Swarm for orchestration
- Managed PostgreSQL (RDS, Cloud SQL, etc.)
- Managed Redis (ElastiCache, Cloud Memory store, etc.)
- CDN for static assets

---

## 💰 Country-Specific Pricing

### Feature Overview
StreamTVDepot supports country-specific pricing for subscription plans. When end-users from different countries subscribe, they are automatically charged the price appropriate for their country (if configured), rather than always paying the base price.

### Why This Matters
- **Industry Standard**: Netflix, Spotify, AWS, Shopify all use this
- **Higher Conversion**: Fair pricing in emerging markets → more subscriptions
- **Increased Revenue**: Different pricing tiers maximize global revenue
- **Better UX**: Users see prices in their local currency

### How It Works
```
User from India subscribes to $9.99 USD plan
    ↓
System reads: EndUser.country = "IN"
    ↓
Searches: ClientSubscriptionPlan.country_pricing
    ↓
Finds: {"country": "IN", "price": 499, "currency": "INR"}
    ↓
Charges: ₹499 INR (not $9.99 USD)
    ↓
Invoice: Shows ₹499 INR
```

### Data Model
```python
ClientSubscriptionPlan
├── price: float                      # Default: $9.99
├── currency: str                     # Default: USD
└── country_pricing: list[dict]       # Country overrides
    └── [
        {"country": "IN", "price": 499, "currency": "INR"},
        {"country": "GB", "price": 7.99, "currency": "GBP"},
        {"country": "AU", "price": 14.99, "currency": "AUD"}
    ]

EndUser
└── country: str | None               # ISO 3166-1 alpha-2 (e.g., "IN")
```

### Implementation
- **File Modified**: `backend/app/api/v1/auth/checkout.py`
- **Change Size**: 35 lines of code
- **Database Changes**: None (uses existing columns)
- **Backward Compatible**: 100% ✅

### Payment Gateways
- **Stripe**: Charges in country-specific currency
- **PayPal**: Creates orders in country-specific currency

### Setup
1. Admins define country pricing per plan (Admin UI)
2. Collect user's country during signup
3. User subscribes at country-specific price
4. Payment processed in local currency

### Example Pricing
| Plan | USA | India | UK | Australia |
|------|-----|-------|-----|-----------|
| Premium | $9.99 USD | ₹499 INR | £7.99 GBP | $14.99 AUD |
| Plus | $4.99 USD | ₹249 INR | £3.99 GBP | $7.49 AUD |

---

## 📋 Compliance & Standards

- **RESTful API**: Standard HTTP methods and status codes
- **TypeScript**: Type safety across codebase
- **ESLint/Prettier**: Code formatting and linting
- **Semantic HTML**: Accessibility standards
- **WCAG 2.1 AA**: Web accessibility guidelines

---

## 🔗 Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system design
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - API endpoints and usage
- **[INSTALLATION.md](INSTALLATION.md)** - Local setup guide
- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - Testing strategy
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment

---

**Next Step**: Read [INSTALLATION.md](INSTALLATION.md) to set up your local development environment.
