# System Architecture - SignalView V2

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Internet / Users                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                          HTTPS (TLS)
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    Nginx Reverse Proxy                          │
│  - Route by Host/Domain                                        │
│  - SSL Termination                                             │
│  - Load Balancing                                              │
│  - Gzip Compression                                            │
│  - Static File Serving                                         │
└──────────────────────────────┬──────────────────────────────────┘
       │                       │
       │                       │
   HTTP │                  HTTP │
       │                       │
       ▼                       ▼
┌─────────────────┐   ┌──────────────────────────┐
│  Frontend App   │   │   Backend API (FastAPI) │
│   (Next.js)     │   │                         │
│                 │   │  ┌──────────────────┐   │
│  • React 18     │   │  │ API Routes (v1)  │   │
│  • Next.js 16   │   │  │                  │   │
│  • TypeScript   │   │  │ /api/v1/...      │   │
│  • Tailwind CSS │   │  └──────────────────┘   │
│  • shadcn/ui    │   │                         │
│  • React Query  │   │  ┌──────────────────┐   │
│  • Port: 3001   │   │  │ Middleware       │   │
│                 │   │  │ • CORS           │   │
│  Components     │   │  │ • Auth           │   │
│  • Navbar       │   │  │ • Logging        │   │
│  • Admin Panel  │   │  │ • Error Handler  │   │
│  • Storefront   │   │  └──────────────────┘   │
│  • Theme Mgmt   │   │                         │
│                 │   │  Port: 8001 (8000)      │
└─────────────────┘   └──────────────────────────┘
       │                       │
       │                       │
       │      ┌────────────────┴───────────────┐
       │      │                               │
       │      ▼                               ▼
       │   ┌─────────────────┐    ┌──────────────────┐
       │   │ PostgreSQL DB   │    │   Redis Cache    │
       │   │                 │    │                  │
       │   │ • Tenants       │    │ • Sessions       │
       │   │ • Content       │    │ • User Prefs     │
       │   │ • Users         │    │ • Cache Layer    │
       │   │ • Settings      │    │                  │
       │   │                 │    │ Port: 6379       │
       │   │ Port: 5433      │    └──────────────────┘
       │   │ (5432)          │
       │   └─────────────────┘
       │         ▲
       │         │ SQL Queries
       │         │ & Transactions
       │    ┌────────────────┐
       │    │ Alembic Migrations
       │    │ Version Control
       │    └────────────────┘
       │
       └─► Static Assets Cache
```

---

## Core Components

### 1. Frontend Application (React + Next.js)

#### Architecture Pattern
```
Next.js App Router
├── Layout (Root + Per-Route)
├── Page Components
│   ├── Public Pages (Marketing, Storefront)
│   ├── Admin Pages (Protected)
│   └── Auth Pages (Login, Signup)
├── API Routes (Optional - for edge middleware)
└── Middleware (Request interception)

React Components Architecture
├── Presentational Components
│   ├── UI Components (shadcn/ui)
│   ├── Layout Components
│   └── Feature Components
├── Container Components
│   └── Connected to React Query
└── Custom Hooks
    ├── useTheme() - Theme management
    ├── useAdminAuth() - Auth state
    └── useUserPrefs() - User preferences
```

#### Key Features
- **Server-Side Rendering (SSR)**: Dynamic content fetching
- **Static Generation (SSG)**: Pre-built static pages
- **Incremental Static Regeneration (ISR)**: Automatic revalidation
- **Image Optimization**: Next.js Image component
- **Code Splitting**: Automatic chunk splitting
- **Route Prefetching**: Smart prefetch on hover

#### State Management
```typescript
// React Query (Server State)
const { data: tenants } = useQuery({
  queryKey: ['tenants'],
  queryFn: fetchTenants,
  staleTime: 5 * 60 * 1000, // 5 minutes
})

// Context API (Client State)
// - Theme state
// - User preferences
// - Admin auth state

// localStorage (Persistent Client State)
// - Theme selection
// - User layout preferences
```

### 2. Backend Application (FastAPI)

#### Architecture Pattern
```
FastAPI Application
├── Main App (app.main:FastAPI)
├── Middleware Layer
│   ├── CORS
│   ├── Error Handler
│   ├── Logging
│   └── Auth Interceptor
├── API Router (v1)
│   ├── /api/v1/health
│   ├── /api/v1/tenants/...
│   ├── /api/v1/content/...
│   ├── /api/v1/users/...
│   └── /api/v1/admin/...
├── Core Layer
│   ├── Configuration (settings.py)
│   ├── Database (SQLAlchemy + asyncpg)
│   ├── Security (auth.py)
│   └── Dependencies (dependency injection)
├── Models Layer
│   └── SQLAlchemy ORM Models
├── Schemas Layer
│   └── Pydantic Request/Response Models
└── Services Layer (Business Logic)
    └── Optional service classes
```

#### Async/Await Pattern
```python
# All endpoints are async
@app.get("/api/v1/content")
async def get_content(
    client_domain: str = Header(...),
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_redis)
) -> ContentResponse:
    # 1. Check cache
    cached = await cache.get(f"content:{client_domain}")
    if cached:
        return ContentResponse.parse_raw(cached)
    
    # 2. Query database
    content = await db.execute(
        select(Content).where(Content.tenant_id == tenant_id)
    )
    
    # 3. Cache result
    await cache.setex(
        f"content:{client_domain}",
        300,  # 5 minutes
        content.json()
    )
    
    return content
```

#### Dependency Injection
```python
# FastAPI uses Depends() for DI
from fastapi import Depends

async def get_db() -> AsyncSession:
    async with async_sessionmaker() as session:
        yield session

@app.get("/items")
async def read_items(db: AsyncSession = Depends(get_db)):
    items = await db.execute(select(Item))
    return items.scalars().all()
```

### 3. Database Layer (PostgreSQL + SQLAlchemy)

#### ORM Pattern
```python
# Define Models
class Tenant(Base):
    __tablename__ = "tenants"
    
    id = Column(Integer, primary_key=True)
    domain = Column(String, unique=True)
    name = Column(String)
    theme = Column(String, default="dark-gold")
    settings = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    contents = relationship("Content", back_populates="tenant")
    users = relationship("User", back_populates="tenant")

# Query Pattern
query = select(Tenant).filter(Tenant.domain == "example.com")
result = await db.execute(query)
tenant = result.scalar_one_or_none()
```

#### Migration Pattern (Alembic)
```bash
# Create migration
alembic revision --autogenerate -m "Add new_column"

# Review generated SQL in alembic/versions/

# Apply migration
alembic upgrade head

# For each environment:
alembic upgrade head --sql  # Preview SQL
```

### 4. Caching Layer (Redis)

#### Cache Patterns
```python
# Pattern 1: Cache Aside (Lazy Loading)
async def get_content(client_domain: str, db, cache):
    # Check cache first
    cached = await cache.get(f"content:{client_domain}")
    if cached:
        return json.loads(cached)
    
    # Load from DB if not in cache
    data = await db.fetch("SELECT * FROM content WHERE domain = ?", client_domain)
    
    # Store in cache
    await cache.setex(
        f"content:{client_domain}",
        300,  # TTL: 5 minutes
        json.dumps(data)
    )
    
    return data

# Pattern 2: Write-Through (Update Both Cache & DB)
async def update_content(id: int, data: dict, db, cache):
    # Update database
    await db.execute("UPDATE content SET ... WHERE id = ?", id)
    
    # Update cache
    await cache.setex(
        f"content:{id}",
        300,
        json.dumps(data)
    )

# Pattern 3: Cache Invalidation (On-Demand)
@app.post("/api/v1/admin/invalidate-cache")
async def invalidate_cache(cache: Redis):
    await cache.flushdb()
    return {"message": "Cache cleared"}
```

---

## Multi-Tenant Architecture

### 1. Tenant Identification

#### Domain-Based Routing
```
User requests domain → Nginx detects host → Routes appropriately

Examples:
- signalview.com → Main SaaS platform
- admin.signalview.com → Admin panel (SAAS)
- admin.customer.com → Customer-specific admin
- customer.com → Customer-specific storefront
```

#### Request Header Injection
```python
# Nginx/Middleware add tenant header
X-Client-Domain: customer.com

# Backend uses header to identify tenant
@app.get("/api/v1/content")
async def get_content(
    client_domain: str = Header("x-client-domain"),
    db: AsyncSession = Depends(get_db)
):
    # All queries scoped to this tenant
    tenant = await _get_tenant(client_domain, db)
    if not tenant:
        raise HTTPException(status_code=404)
    
    # Query with tenant isolation
    content = await db.execute(
        select(Content).where(Content.tenant_id == tenant.id)
    )
    return content.scalars().all()
```

### 2. Data Isolation

#### Row-Level Isolation
```python
# Every table has tenant_id foreign key
class Content(Base):
    __tablename__ = "content"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    title = Column(String)
    # ... other fields

# Query ALWAYS filters by tenant_id
def _build_query(tenant_id: int):
    return select(Content).where(Content.tenant_id == tenant_id)
```

### 3. Tenant Configuration

#### Per-Tenant Settings
```python
class Tenant(Base):
    settings = Column(JSON, default={
        "theme": "dark-gold",
        "language": "en",
        "timezone": "UTC",
        "features": {
            "livestream": True,
            "reviews": True,
            "comments": True
        }
    })
```

---

## Authentication & Authorization Flow

### 1. Admin Authentication

```
Admin Login
    ↓
POST /api/v1/admin/login { email, password }
    ↓
Backend validates credentials
    ↓
Generate JWT token (or Session)
    ↓
Return token in response
    ↓
Frontend stores in localStorage/cookies
    ↓
Subsequent requests include token (Authorization header)
    ↓
Backend validates token on protected routes
    ↓
Access granted/denied based on tenant_id in token
```

### 2. Authorization Guards

```python
# Protected Route Example
@app.get("/api/v1/admin/dashboard")
async def get_admin_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # get_current_user validates:
    # 1. Token is valid
    # 2. User is authenticated
    # 3. User has admin role
    
    # get_current_admin_user validates:
    # 1. All above
    # 2. User role == "admin"
    
    return admin_dashboard_data
```

---

## Error Handling & Logging

### 1. Error Handling Strategy

```python
from fastapi import HTTPException

# Structured error responses
class ErrorResponse(BaseModel):
    error: str
    detail: str
    code: str
    timestamp: datetime

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail,
            detail=str(exc),
            code="HTTP_ERROR",
            timestamp=datetime.now()
        ).dict()
    )

@app.get("/api/v1/items/{item_id}")
async def get_item(item_id: int, db: AsyncSession):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Item {item_id} not found",
            headers={"X-Error-Code": "ITEM_NOT_FOUND"}
        )
    return item
```

### 2. Logging Strategy

```python
import logging
from pythonjsonlogger import jsonlogger

# Structured JSON logging
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
handler.setFormatter(formatter)
logger.addHandler(handler)

# Usage
logger.info("User authenticated", extra={
    "user_id": user.id,
    "tenant_id": tenant.id,
    "action": "auth_success"
})

logger.error("Database error", extra={
    "error_code": "DB_ERROR",
    "query": "SELECT * FROM users",
    "tenant_id": tenant_id
}, exc_info=True)
```

---

## Deployment Architecture

### Development
```
Docker Compose (Local Machine)
├── Frontend Container
├── Backend Container
├── PostgreSQL Container
├── Redis Container
└── Nginx Container (optional)
```

### Production
```
Kubernetes Cluster or Docker Swarm
├── Frontend Service (Replicas: 2-5)
├── Backend Service (Replicas: 2-5)
├── Database (Managed: RDS, Cloud SQL, etc.)
├── Cache Layer (Managed: ElastiCache, etc.)
├── Ingress/Load Balancer
├── Storage (S3, GCS, etc.)
└── CDN (CloudFront, Cloudflare, etc.)
```

---

## Performance Optimization Strategies

### 1. Database Performance
- **Connection Pooling**: SQLAlchemy session pool
- **Query Optimization**: Indexed queries on tenant_id, domain
- **Lazy Loading**: Load relationships on demand
- **Batch Operations**: Bulk insert/update

### 2. API Performance
- **Response Caching**: Redis cache layer
- **Pagination**: Limit result sets
- **Compression**: Gzip responses
- **Rate Limiting**: Prevent abuse

### 3. Frontend Performance
- **Code Splitting**: Automatic chunk splitting
- **Image Optimization**: Next.js Image component
- **Lazy Loading**: React.lazy() components
- **React Query Caching**: Automatic HTTP cache

---

## Security Considerations

### 1. Input Validation
```python
from pydantic import BaseModel, Field, validator

class UserCreate(BaseModel):
    email: str = Field(..., regex=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    password: str = Field(..., min_length=8)
    
    @validator('password')
    def validate_password(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must have uppercase')
        return v
```

### 2. SQL Injection Prevention
```python
# ✅ SAFE: Using SQLAlchemy ORM
query = select(User).where(User.email == email)

# ✅ SAFE: Using parameterized queries
query = "SELECT * FROM users WHERE email = ?"
db.execute(query, [email])

# ❌ UNSAFE: String concatenation
query = f"SELECT * FROM users WHERE email = '{email}'"
```

### 3. CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://example.com", "https://*.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

---

## API Request-Response Cycle

```
1. Client Request
   POST /api/v1/content
   Headers: {
     Authorization: Bearer token,
     X-Client-Domain: customer.com,
     Content-Type: application/json
   }
   Body: { title: "Movie Title", ... }

2. Nginx (Reverse Proxy)
   - Receives request on port 80/443
   - SSL decryption (if HTTPS)
   - Route based on path
   - Forward to backend on port 8000

3. FastAPI Middleware Chain
   - CORS check
   - Request logging
   - Auth token validation
   - Body parsing

4. Route Handler
   @app.post("/api/v1/content")
   async def create_content(...):
       # Get current user & tenant
       # Validate input (Pydantic)
       # Check authorization
       # Create resource in DB
       # Update cache
       # Return response

5. Response
   Status: 201 Created
   Headers: {
     Content-Type: application/json,
     X-Request-ID: uuid
   }
   Body: { id: 123, title: "Movie Title", ... }

6. Client Processing
   - Parse JSON response
   - Update React Query cache
   - Re-render component
```

---

## Integration Points

### Frontend ↔ Backend
```
HTTP/REST API
├── JSON Request/Response format
├── Axios HTTP client
├── React Query for state management
└── Error handling middleware
```

### Backend ↔ Database
```
SQLAlchemy ORM
├── Async connections (asyncpg)
├── Connection pooling
├── Query builder
└── Transaction management
```

### Backend ↔ Cache
```
Redis Client (aioredis)
├── Async operations
├── TTL-based expiration
├── Pattern-based operations
└── Atomic operations
```

---

## Related Documentation

- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - Testing patterns
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - API endpoints
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment

---

**Next**: Review [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for endpoint details.
