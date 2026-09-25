# API Documentation - SignalView V2

## API Overview

The SignalView API is built with FastAPI and follows RESTful conventions. All responses are JSON formatted and include appropriate HTTP status codes.

### Base URL
```
Development: http://localhost:8001/api/v1
Production: https://api.signalview.com/api/v1
```

### Authentication
Most endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Request Headers
All requests should include these headers:
```
Content-Type: application/json
X-Client-Domain: example.com  # Multi-tenant isolation
Authorization: Bearer token   # For protected endpoints
X-Request-ID: uuid           # Optional for tracking
```

---

## API Endpoints

### Health Check

#### Check API Health
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "app": "SignalView",
  "version": "1.0.0"
}
```

**Status Code:** `200 OK`

---

### Authentication Endpoints

#### Admin Login
```http
POST /api/v1/admin/login
```

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword123"
}
```

**Response (Success):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "tenant_id": 1
  }
}
```

**Status Codes:**
- `200 OK` - Login successful
- `401 Unauthorized` - Invalid credentials
- `404 Not Found` - User not found
- `422 Unprocessable Entity` - Validation error

#### Admin Logout
```http
POST /api/v1/admin/logout
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

**Status Code:** `200 OK`

#### Get Current User
```http
GET /api/v1/admin/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "admin",
  "tenant_id": 1,
  "created_at": "2024-01-15T10:30:00Z",
  "last_login": "2024-04-09T14:22:00Z"
}
```

**Status Codes:**
- `200 OK` - User found
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - User not found

---

### Content Management Endpoints

#### List All Content
```http
GET /api/v1/content
X-Client-Domain: example.com
```

**Query Parameters:**
- `page` (int, default: 1) - Page number for pagination
- `limit` (int, default: 20, max: 100) - Items per page
- `category` (string) - Filter by category
- `search` (string) - Search in title/description
- `sort` (string, default: "-created_at") - Sort field (prefix with - for desc)

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "title": "Inception",
      "description": "A thief who steals corporate secrets...",
      "category": "movies",
      "thumbnail_url": "https://cdn.example.com/images/inception.jpg",
      "duration": 148,
      "year": 2010,
      "rating": 8.8,
      "status": "published",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid query parameters
- `403 Forbidden` - Tenant mismatch

#### Get Single Content
```http
GET /api/v1/content/:id
X-Client-Domain: example.com
```

**Parameters:**
- `id` (int) - Content ID

**Response:**
```json
{
  "id": 1,
  "title": "Inception",
  "description": "A thief who steals corporate secrets...",
  "category": "movies",
  "thumbnail_url": "https://cdn.example.com/images/inception.jpg",
  "duration": 148,
  "year": 2010,
  "rating": 8.8,
  "status": "published",
  "cast": ["Leonardo DiCaprio", "Marion Cotillard"],
  "director": "Christopher Nolan",
  "genre": ["sci-fi", "thriller"],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Content found
- `404 Not Found` - Content not found
- `403 Forbidden` - Access denied

#### Create Content (Admin Only)
```http
POST /api/v1/content
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Request Body:**
```json
{
  "title": "Inception",
  "description": "A thief who steals corporate secrets...",
  "category": "movies",
  "thumbnail_url": "https://cdn.example.com/images/inception.jpg",
  "duration": 148,
  "year": 2010,
  "rating": 8.8,
  "cast": ["Leonardo DiCaprio"],
  "director": "Christopher Nolan",
  "genre": ["sci-fi", "thriller"]
}
```

**Response:**
```json
{
  "id": 1,
  "title": "Inception",
  "status": "draft",
  "created_at": "2024-04-09T10:00:00Z"
}
```

**Status Codes:**
- `201 Created` - Content created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not an admin

#### Update Content (Admin Only)
```http
PUT /api/v1/content/:id
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Request Body:**
```json
{
  "title": "Inception (Updated)",
  "rating": 8.9
}
```

**Response:**
```json
{
  "id": 1,
  "title": "Inception (Updated)",
  "rating": 8.9,
  "updated_at": "2024-04-09T11:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Updated
- `404 Not Found` - Content not found
- `400 Bad Request` - Validation error
- `403 Forbidden` - Not an admin

#### Delete Content (Admin Only)
```http
DELETE /api/v1/content/:id
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Response:** (No content)

**Status Codes:**
- `204 No Content` - Deleted
- `404 Not Found` - Content not found
- `403 Forbidden` - Not an admin

#### Publish Content (Admin Only)
```http
PUT /api/v1/content/:id/publish
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Response:**
```json
{
  "id": 1,
  "status": "published",
  "published_at": "2024-04-09T11:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Published
- `404 Not Found` - Content not found
- `400 Bad Request` - Already published
- `403 Forbidden` - Not an admin

---

### Tenant Management Endpoints

#### Get Current Tenant
```http
GET /api/v1/tenant
X-Client-Domain: example.com
```

**Response:**
```json
{
  "id": 1,
  "domain": "example.com",
  "name": "Example Store",
  "theme": "dark-gold",
  "settings": {
    "language": "en",
    "timezone": "UTC",
    "features": {
      "reviews": true,
      "comments": true
    }
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Tenant found
- `404 Not Found` - Tenant not found

#### Update Tenant Settings (Admin Only)
```http
PUT /api/v1/tenant/settings
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Request Body:**
```json
{
  "theme": "neon-city",
  "settings": {
    "language": "en",
    "timezone": "America/New_York"
  }
}
```

**Response:**
```json
{
  "id": 1,
  "theme": "neon-city",
  "settings": {
    "language": "en",
    "timezone": "America/New_York"
  },
  "updated_at": "2024-04-09T11:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Updated
- `400 Bad Request` - Validation error
- `403 Forbidden` - Not an admin

---

### User Management Endpoints

#### List Users (Admin Only)
```http
GET /api/v1/users
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Query Parameters:**
- `page` (int, default: 1)
- `limit` (int, default: 20)
- `role` (string) - Filter by role

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

#### Get User (Admin Only)
```http
GET /api/v1/users/:user_id
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

#### Create User (Admin Only)
```http
POST /api/v1/users
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "password": "SecurePassword123",
  "role": "user"
}
```

**Status Codes:**
- `201 Created` - User created
- `400 Bad Request` - Validation error or email exists
- `403 Forbidden` - Not an admin

#### Update User (Admin Only)
```http
PUT /api/v1/users/:user_id
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

#### Delete User (Admin Only)
```http
DELETE /api/v1/users/:user_id
Authorization: Bearer <admin_token>
X-Client-Domain: example.com
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Validation Error",
  "detail": "Field 'title' is required",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-04-09T10:00:00Z"
}
```

### Common HTTP Status Codes
| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 200 | OK | Successful GET/PUT |
| 201 | Created | Successful POST creating resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input/parameters |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected error |

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

```
Default: 1000 requests per 15 minutes per IP
Admin endpoints: 5000 requests per 15 minutes per token
```

Rate limit headers in response:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1712671200
```

---

## Pagination

List endpoints support pagination:

**Request:**
```http
GET /api/v1/content?page=2&limit=25
```

**Response:**
```json
{
  "items": [...],
  "pagination": {
    "page": 2,
    "limit": 25,
    "total": 150,
    "pages": 6,
    "has_next": true,
    "has_prev": true
  }
}
```

---

## Example API Requests

### cURL Examples

#### Get Content
```bash
curl -X GET http://localhost:8001/api/v1/content \
  -H "X-Client-Domain: example.com" \
  -H "Content-Type: application/json"
```

#### Admin Login
```bash
curl -X POST http://localhost:8001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

#### Create Content (with token)
```bash
curl -X POST http://localhost:8001/api/v1/content \
  -H "Authorization: Bearer <token>" \
  -H "X-Client-Domain: example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Movie",
    "description": "Description",
    "category": "movies"
  }'
```

### JavaScript/Fetch Examples

```typescript
// Get content
const response = await fetch('http://localhost:8001/api/v1/content', {
  headers: {
    'X-Client-Domain': 'example.com',
    'Content-Type': 'application/json'
  }
})
const data = await response.json()

// With authorization
const response = await fetch('http://localhost:8001/api/v1/admin/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Client-Domain': 'example.com',
    'Content-Type': 'application/json'
  }
})
const data = await response.json()
```

### Axios Examples

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8001/api/v1',
  headers: {
    'X-Client-Domain': 'example.com'
  }
})

// Add auth token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Get content
const { data } = await api.get('/content')

// Create content
const { data } = await api.post('/content', {
  title: 'New Movie',
  description: 'Description'
})
```

---

## Webhook Events (Future)

Webhooks will be available for real-time updates:

```
POST /webhooks/events
- content.created
- content.updated
- content.deleted
- content.published
- user.created
- tenant.updated
```

---

## API Documentation Interface

Access interactive API documentation:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc
- **OpenAPI Schema**: http://localhost:8001/openapi.json

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - API design patterns
- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - API testing
- **[INSTALLATION.md](INSTALLATION.md)** - Local API setup

---

**Status**: ✅ API v1 Complete
**Next**: See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
