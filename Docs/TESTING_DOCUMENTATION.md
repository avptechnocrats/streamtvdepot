# Testing Documentation - SignalView V2

## Testing Strategy Overview

```
Testing Pyramid
       ▲
      /  \
    /      \  E2E Tests (5-10%)
   /        \  ├─ User journeys
  /──────────\ ├─ Integration scenarios
 /            \ └─ Critical paths
/──────────────\
    Unit Tests (40-50%)   Integration Tests (30-40%)
├─ Functions           ├─ API endpoints
├─ Components          ├─ Database queries
├─ Utilities           ├─ Cache operations
└─ Hooks               └─ Multi-service flows
```

### Coverage Goals
- **Overall**: 80%+ code coverage
- **Critical Paths**: 100% coverage
- **API Routes**: 95%+ coverage
- **Business Logic**: 90%+ coverage
- **UI Components**: 70%+ coverage (focus on critical components)

---

## Backend Testing

### 1. Unit Tests (PyTest)

#### Test Structure
```python
# File: backend/tests/test_models.py

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Tenant, Content
from app.schemas import TenantCreate

@pytest.fixture
async def db_session():
    """Fixture for database session"""
    async with AsyncSession(engine) as session:
        yield session

@pytest.fixture
async def sample_tenant(db_session):
    """Fixture for creating a sample tenant"""
    tenant = Tenant(
        domain="test.com",
        name="Test Tenant",
        theme="dark-gold"
    )
    db_session.add(tenant)
    await db_session.commit()
    return tenant

class TestTenantModel:
    """Test suite for Tenant model"""
    
    @pytest.mark.asyncio
    async def test_create_tenant(self, db_session):
        """Test creating a tenant"""
        tenant = Tenant(domain="newdomain.com", name="New Tenant")
        db_session.add(tenant)
        await db_session.commit()
        
        result = await db_session.get(Tenant, tenant.id)
        assert result.domain == "newdomain.com"
        assert result.name == "New Tenant"
    
    @pytest.mark.asyncio
    async def test_tenant_unique_domain(self, db_session, sample_tenant):
        """Test tenant domain uniqueness"""
        duplicate_tenant = Tenant(
            domain="test.com",  # Same as sample_tenant
            name="Duplicate"
        )
        db_session.add(duplicate_tenant)
        
        with pytest.raises(IntegrityError):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_tenant_relationship_with_content(self, db_session, sample_tenant):
        """Test tenant-content relationship"""
        content = Content(
            tenant_id=sample_tenant.id,
            title="Test Movie",
            description="A test movie"
        )
        db_session.add(content)
        await db_session.commit()
        
        tenant = await db_session.get(Tenant, sample_tenant.id)
        assert len(tenant.contents) == 1
        assert tenant.contents[0].title == "Test Movie"
```

#### Test Patterns for FastAPI Endpoints
```python
# File: backend/tests/test_api_endpoints.py

from fastapi.testclient import TestClient
from app.main import app
import pytest

client = TestClient(app)

@pytest.fixture
def auth_headers():
    """Generate authorization headers"""
    return {
        "Authorization": "Bearer test_token",
        "X-Client-Domain": "test.com"
    }

class TestContentAPI:
    """Test suite for Content API endpoints"""
    
    def test_get_content_success(self, auth_headers, mocker):
        """Test successful content retrieval"""
        # Mock database call
        mocker.patch(
            'app.api.routes.get_content_from_db',
            return_value=[
                {"id": 1, "title": "Movie 1"},
                {"id": 2, "title": "Movie 2"}
            ]
        )
        
        response = client.get(
            "/api/v1/content",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert len(response.json()) == 2
        assert response.json()[0]["title"] == "Movie 1"
    
    def test_get_content_unauthorized(self):
        """Test unauthorized access"""
        response = client.get("/api/v1/content")
        assert response.status_code == 403
        assert "Unauthorized" in response.json()["detail"]
    
    def test_get_content_invalid_tenant(self, auth_headers, mocker):
        """Test accessing content from non-existent tenant"""
        auth_headers["X-Client-Domain"] = "nonexistent.com"
        
        mocker.patch(
            'app.api.routes.get_tenant',
            return_value=None
        )
        
        response = client.get(
            "/api/v1/content",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        assert "Tenant not found" in response.json()["detail"]
    
    def test_create_content_success(self, auth_headers, mocker):
        """Test successful content creation"""
        mocker.patch(
            'app.api.routes.save_content',
            return_value={"id": 1, "title": "New Movie"}
        )
        
        response = client.post(
            "/api/v1/content",
            json={"title": "New Movie", "description": "A new movie"},
            headers=auth_headers
        )
        
        assert response.status_code == 201
        assert response.json()["id"] == 1
    
    def test_create_content_validation_error(self, auth_headers):
        """Test content creation with invalid data"""
        response = client.post(
            "/api/v1/content",
            json={"title": ""},  # Empty title
            headers=auth_headers
        )
        
        assert response.status_code == 422
        assert "validation error" in response.json()["detail"][0]["msg"]
    
    def test_delete_content_success(self, auth_headers, mocker):
        """Test successful content deletion"""
        mocker.patch('app.api.routes.delete_content', return_value=True)
        
        response = client.delete(
            "/api/v1/content/1",
            headers=auth_headers
        )
        
        assert response.status_code == 204
    
    def test_delete_content_not_found(self, auth_headers, mocker):
        """Test deleting non-existent content"""
        mocker.patch('app.api.routes.delete_content', return_value=False)
        
        response = client.delete(
            "/api/v1/content/999",
            headers=auth_headers
        )
        
        assert response.status_code == 404
```

#### Cache Testing
```python
# File: backend/tests/test_cache.py

import pytest
from app.cache import CacheManager

@pytest.fixture
async def cache_manager():
    manager = CacheManager()
    await manager.connect()
    yield manager
    await manager.disconnect()

class TestCacheManager:
    """Test suite for cache operations"""
    
    @pytest.mark.asyncio
    async def test_set_and_get(self, cache_manager):
        """Test setting and getting cache values"""
        await cache_manager.set("test_key", "test_value", ttl=60)
        value = await cache_manager.get("test_key")
        assert value == "test_value"
    
    @pytest.mark.asyncio
    async def test_cache_expiration(self, cache_manager):
        """Test cache expiration"""
        await cache_manager.set("expiring_key", "value", ttl=1)
        
        # Immediately get - should exist
        value = await cache_manager.get("expiring_key")
        assert value == "value"
        
        # Wait for expiration
        import asyncio
        await asyncio.sleep(1.1)
        
        # Should be expired now
        value = await cache_manager.get("expiring_key")
        assert value is None
    
    @pytest.mark.asyncio
    async def test_delete(self, cache_manager):
        """Test cache deletion"""
        await cache_manager.set("deletable_key", "value")
        await cache_manager.delete("deletable_key")
        value = await cache_manager.get("deletable_key")
        assert value is None
    
    @pytest.mark.asyncio
    async def test_cache_invalidation_pattern(self, cache_manager):
        """Test pattern-based cache invalidation"""
        # Set multiple cache entries
        await cache_manager.set("content:tenant1:item1", "value1")
        await cache_manager.set("content:tenant1:item2", "value2")
        await cache_manager.set("content:tenant2:item1", "value3")
        
        # Invalidate tenant1 content
        await cache_manager.delete_pattern("content:tenant1:*")
        
        # tenant1 should be cleared
        assert await cache_manager.get("content:tenant1:item1") is None
        assert await cache_manager.get("content:tenant1:item2") is None
        
        # tenant2 should remain
        assert await cache_manager.get("content:tenant2:item1") == "value3"
```

### 2. Integration Tests

#### Database Integration Tests
```python
# File: backend/tests/test_db_integration.py

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.database import Base
from app.models import Tenant, Content, User

@pytest.fixture
async def db_engine():
    """Create test database"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
async def db_session(db_engine):
    """Create database session"""
    async with AsyncSession(db_engine) as session:
        yield session

class TestTenantContentIntegration:
    """Integration tests for tenant-content relationships"""
    
    @pytest.mark.asyncio
    async def test_create_tenant_with_content(self, db_session):
        """Test creating tenant and adding content"""
        # Create tenant
        tenant = Tenant(domain="shop.com", name="Online Shop")
        db_session.add(tenant)
        await db_session.flush()
        
        # Add multiple content items
        for i in range(3):
            content = Content(
                tenant_id=tenant.id,
                title=f"Movie {i}",
                description=f"Description {i}"
            )
            db_session.add(content)
        
        await db_session.commit()
        
        # Verify relationship
        result = await db_session.get(Tenant, tenant.id)
        assert len(result.contents) == 3
        assert result.contents[0].title == "Movie 0"
    
    @pytest.mark.asyncio
    async def test_cascade_delete(self, db_session):
        """Test cascade delete from tenant to content"""
        tenant = Tenant(domain="shop.com", name="Shop")
        db_session.add(tenant)
        await db_session.flush()
        
        content = Content(tenant_id=tenant.id, title="Movie")
        db_session.add(content)
        await db_session.commit()
        
        # Delete tenant
        await db_session.delete(tenant)
        await db_session.commit()
        
        # Content should be deleted too
        result = await db_session.get(Content, content.id)
        assert result is None
```

### 3. End-to-End (E2E) Tests

#### API Flow Tests
```python
# File: backend/tests/test_e2e.py

import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
class TestCompleteUserJourney:
    """End-to-end tests for complete user workflows"""
    
    async def test_admin_manages_content(self):
        """Test: Admin logs in, creates and publishes content"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Step 1: Admin login
            login_response = await client.post(
                "/api/v1/admin/login",
                json={"email": "admin@shop.com", "password": "password123"}
            )
            assert login_response.status_code == 200
            token = login_response.json()["access_token"]
            
            headers = {"Authorization": f"Bearer {token}", "X-Client-Domain": "shop.com"}
            
            # Step 2: Create content
            create_response = await client.post(
                "/api/v1/admin/content",
                json={
                    "title": "New Movie",
                    "description": "Description",
                    "category": "movies"
                },
                headers=headers
            )
            assert create_response.status_code == 201
            content_id = create_response.json()["id"]
            
            # Step 3: Publish content
            publish_response = await client.put(
                f"/api/v1/admin/content/{content_id}/publish",
                headers=headers
            )
            assert publish_response.status_code == 200
            
            # Step 4: Verify content is visible on storefront
            storefront_response = await client.get(
                "/api/v1/content",
                headers={"X-Client-Domain": "shop.com"}
            )
            assert storefront_response.status_code == 200
            content_list = storefront_response.json()
            assert any(c["id"] == content_id for c in content_list)
```

### 4. Running Backend Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_models.py

# Run specific test class
pytest tests/test_api_endpoints.py::TestContentAPI

# Run specific test
pytest tests/test_api_endpoints.py::TestContentAPI::test_get_content_success

# Run with coverage
pytest --cov=app --cov-report=html

# Run with verbose output
pytest -v

# Run with markers
pytest -m integration

# Run tests in parallel
pytest -n auto
```

---

## Frontend Testing

### 1. Unit Tests (Jest/Vitest)

#### Component Testing
```typescript
// File: frontend/tests/components/Navbar.test.tsx

import { render, screen, fireEvent } from '@testing-library/react'
import { Navbar } from '@/components/Navbar'
import { ThemeProvider } from '@/contexts/ThemeContext'

describe('Navbar Component', () => {
  function renderWithTheme(component: React.ReactNode) {
    return render(
      <ThemeProvider>
        {component}
      </ThemeProvider>
    )
  }

  it('should render navigation links', () => {
    renderWithTheme(<Navbar />)
    
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('should toggle theme on button click', () => {
    renderWithTheme(<Navbar />)
    const themeToggle = screen.getByTestId('theme-toggle')
    
    fireEvent.click(themeToggle)
    
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('should show admin menu for authenticated admin', () => {
    const mockAdmin = { isAdmin: true, email: 'admin@test.com' }
    renderWithTheme(<Navbar user={mockAdmin} />)
    
    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })

  it('should not show admin menu for regular users', () => {
    const mockUser = { isAdmin: false, email: 'user@test.com' }
    renderWithTheme(<Navbar user={mockUser} />)
    
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })
})
```

#### Hook Testing
```typescript
// File: frontend/tests/hooks/useTheme.test.ts

import { renderHook, act } from '@testing-library/react'
import { useTheme } from '@/hooks/use-theme'

describe('useTheme Hook', () => {
  it('should initialize with default theme', () => {
    const { result } = renderHook(() => useTheme())
    
    expect(result.current.activeThemeId).toBe('dark-gold')
  })

  it('should change theme on setTheme call', () => {
    const { result } = renderHook(() => useTheme())
    
    act(() => {
      result.current.setTheme('neon-city')
    })
    
    expect(result.current.activeThemeId).toBe('neon-city')
  })

  it('should persist theme to localStorage', () => {
    const { result } = renderHook(() => useTheme())
    
    act(() => {
      result.current.setTheme('neon-city')
    })
    
    expect(localStorage.getItem('streamvault-theme')).toBe('neon-city')
  })

  it('should restore theme from localStorage', () => {
    localStorage.setItem('streamvault-theme', 'neon-city')
    const { result } = renderHook(() => useTheme())
    
    expect(result.current.activeThemeId).toBe('neon-city')
  })
})
```

#### API Mocking (MSW - Mock Service Worker)
```typescript
// File: frontend/tests/mocks/handlers.ts

import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('http://localhost:8001/api/v1/content', () => {
    return HttpResponse.json([
      { id: 1, title: 'Movie 1', description: 'Description 1' },
      { id: 2, title: 'Movie 2', description: 'Description 2' }
    ])
  }),

  http.post('http://localhost:8001/api/v1/content', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 }
    )
  }),

  http.get('http://localhost:8001/api/v1/content/:id', ({ params }) => {
    return HttpResponse.json({
      id: parseInt(params.id as string),
      title: 'Test Movie'
    })
  })
]

// File: frontend/tests/setup.ts
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers'

export const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

#### Component Integration with API
```typescript
// File: frontend/tests/integration/ContentList.test.tsx

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentList } from '@/components/ContentList'
import { server } from '../mocks/setup'
import { http, HttpResponse } from 'msw'

describe('ContentList Component Integration', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  function renderWithProviders(component: React.ReactNode) {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  it('should fetch and display content', async () => {
    renderWithProviders(<ContentList />)
    
    await waitFor(() => {
      expect(screen.getByText('Movie 1')).toBeInTheDocument()
      expect(screen.getByText('Movie 2')).toBeInTheDocument()
    })
  })

  it('should handle API error', async () => {
    server.use(
      http.get('http://localhost:8001/api/v1/content', () => {
        return HttpResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(<ContentList />)
    
    await waitFor(() => {
      expect(screen.getByText(/error loading content/i)).toBeInTheDocument()
    })
  })

  it('should display loading state', () => {
    renderWithProviders(<ContentList />)
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
  })
})
```

### 2. Running Frontend Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test --watch

# Run specific test file
npm test ContentList.test.tsx

# Run tests with coverage
npm test --coverage

# Run only unit tests
npm test -- --testPathPattern="(?<!integration)"

# Run only integration tests
npm test -- --testPathPattern="integration"
```

---

## Test Case Documentation

### Backend API Test Cases

#### 1. Authentication Tests
| Test Case | Endpoint | Input | Expected Output | Status |
|-----------|----------|-------|-----------------|--------|
| Valid login | POST /api/v1/admin/login | Valid email & password | 200, JWT token | ✅ |
| Invalid password | POST /api/v1/admin/login | Valid email, wrong password | 401, Unauthorized | ✅ |
| Non-existent user | POST /api/v1/admin/login | Non-existent email | 404, Not found | ✅ |
| Missing credentials | POST /api/v1/admin/login | Empty body | 422, Validation error | ✅ |
| Expired token | GET /api/v1/admin/dashboard | Expired JWT | 401, Unauthorized | ✅ |

#### 2. Content Management Tests
| Test Case | Endpoint | Input | Expected Output | Status |
|-----------|----------|-------|-----------------|--------|
| Create content | POST /api/v1/content | Valid content data | 201, Content ID | ✅ |
| Duplicate title | POST /api/v1/content | Duplicate title | 400, Already exists | ✅ |
| Get all content | GET /api/v1/content | Client-Domain header | 200, Content array | ✅ |
| Get single content | GET /api/v1/content/:id | Valid ID | 200, Content object | ✅ |
| Get invalid ID | GET /api/v1/content/:id | Invalid ID | 404, Not found | ✅ |
| Update content | PUT /api/v1/content/:id | Valid updates | 200, Updated object | ✅ |
| Delete content | DELETE /api/v1/content/:id | Valid ID | 204, No content | ✅ |
| Delete invalid ID | DELETE /api/v1/content/:id | Invalid ID | 404, Not found | ✅ |

#### 3. Multi-Tenant Isolation Tests
| Test Case | Scenario | Expected Behavior | Status |
|-----------|----------|-------------------|--------|
| Tenant A accessing own content | GET /api/v1/content with X-Client-Domain: a.com | Returns only A's content | ✅ |
| Tenant A accessing B's content | GET /api/v1/content/[B's ID] with X-Client-Domain: a.com | 403, Forbidden | ✅ |
| Cross-tenant update attempt | PUT /api/v1/content/[B's ID] with X-Client-Domain: a.com | 403, Forbidden | ✅ |
| No client domain header | GET /api/v1/content | 400, Bad request | ✅ |
| Invalid client domain | GET /api/v1/content with X-Client-Domain: fake.com | 404, Tenant not found | ✅ |

#### 4. Cache Tests
| Test Case | Scenario | Expected Behavior | Status |
|-----------|----------|-------------------|--------|
| Cache hit | GET /api/v1/content (second call) | Returns cached data | ✅ |
| Cache hit with timestamp | GET /api/v1/content | Cache served within TTL | ✅ |
| Cache expiration | GET /api/v1/content after TTL | Fetches fresh data | ✅ |
| Cache invalidation on update | PUT then GET /api/v1/content | Cache cleared and refreshed | ✅ |
| Cache invalidation on delete | DELETE then GET /api/v1/content | Cache cleared | ✅ |

### Frontend Component Test Cases

#### 1. UI Component Tests
| Component | Test Case | Expected Result | Status |
|-----------|-----------|-----------------|--------|
| Navbar | Renders all links | All nav links visible | ✅ |
| Navbar | Theme toggle works | Theme changes on click | ✅ |
| Navbar | Shows admin link for admins | Admin link visible only for admins | ✅ |
| Navbar | Mobile menu opens/closes | Menu toggle works | ✅ |
| ContentCard | Displays content info | Title, description visible | ✅ |
| ContentCard | Click to view details | Opens detail view | ✅ |
| ContentGrid | Renders multiple cards | All content displayed | ✅ |
| ContentGrid | Infinite scroll works | Loads more on scroll | ✅ |
| ThemeSelector | Shows all themes | All themes displayed | ✅ |
| ThemeSelector | Applies selected theme | Theme changes immediately | ✅ |

#### 2. Authentication Tests
| Test Case | Scenario | Expected Result | Status |
|-----------|----------|-----------------|--------|
| Login form | Valid credentials | Redirects to dashboard | ✅ |
| Login form | Invalid credentials | Shows error message | ✅ |
| Login form | Empty fields | Shows validation errors | ✅ |
| Signup form | Valid data | Creates account & redirects | ✅ |
| Protected route | Without auth | Redirects to login | ✅ |
| Protected route | With auth | Loads page | ✅ |
| Session expiry | Expired token | Redirects to login | ✅ |

#### 3. Hook Tests
| Hook | Test Case | Expected Result | Status |
|------|-----------|-----------------|--------|
| useTheme | Initialize | Default theme loaded | ✅ |
| useTheme | Set theme | Theme changes | ✅ |
| useTheme | Persist | Theme saved to localStorage | ✅ |
| useUserPrefs | Load prefs | Preferences loaded | ✅ |
| useUserPrefs | Update prefs | Preferences updated | ✅ |
| useMobile | Detect desktop | isMobile = false | ✅ |
| useMobile | Detect mobile | isMobile = true | ✅ |
| useAdminAuth | Check auth | Returns auth status | ✅ |

#### 4. Integration Tests
| Test Case | Scenario | Expected Result | Status |
|-----------|----------|-----------------|--------|
| User visits storefront | No auth required | Loads public content | ✅ |
| User browses content | Load content list | Displays all content | ✅ |
| User filters content | Apply filter | Shows filtered results | ✅ |
| User changes theme | Select theme | All components update | ✅ |
| Admin logs in | Valid admin creds | Redirects to admin panel | ✅ |
| Admin creates content | Fill form & submit | Content created | ✅ |
| Admin publishes content | Click publish | Content visible on storefront | ✅ |

---

## Continuous Integration (CI) Setup

### GitHub Actions Example
```yaml
# File: .github/workflows/test.yml

name: Run Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      
      - name: Run tests with coverage
        run: |
          cd backend
          pytest --cov=app --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage.xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Run tests
        run: |
          cd frontend
          npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Performance Testing

### Load Testing (k6)
```javascript
// File: tests/performance/loadtest.js

import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: 100,           // 100 virtual users
  duration: '30s',    // 30 second test
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
  }
}

export default function () {
  const res = http.get('http://localhost:8001/api/v1/content')
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  })
}

// Run: k6 run loadtest.js
```

---

## Test Reporting

### Coverage Report Generation
```bash
# Backend coverage
cd backend
pytest --cov=app --cov-report=html
open htmlcov/index.html

# Frontend coverage
cd ../frontend
npm test -- --coverage
open coverage/lcov-report/index.html
```

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and patterns
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - API endpoints to test
- **[INSTALLATION.md](INSTALLATION.md)** - Setup for testing environment

---

**Status**: ✅ Ready for Testing
**Next**: [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
