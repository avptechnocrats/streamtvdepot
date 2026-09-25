# SignalView V2 Documentation

Welcome to the SignalView V2 documentation. This folder contains comprehensive guides for understanding, developing, testing, and deploying the SignalView multi-tenant media SaaS platform.

## 📚 Documentation Structure

### Quick Start
- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Project description, features, and high-level architecture
- **[INSTALLATION.md](INSTALLATION.md)** - Local development setup and environment configuration

### Development
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, technology stack, and design patterns
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - REST API endpoints, request/response formats, and examples

### Quality Assurance
- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - Testing strategy, test cases, and coverage guidelines

### Operations
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment procedures, Docker setup, and production configuration

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)
- PostgreSQL 16+ (if running without Docker)
- Redis 7+ (for caching)

### Start Development Server
```bash
# Navigate to project root
cd /Volumes/Emperical/Devel/SignalView/V2

# Start all services with Docker Compose
docker-compose up

# Frontend: http://localhost:3001
# Backend API: http://localhost:8001
# API Docs: http://localhost:8001/docs
```

### Key Ports
| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Next.js) | 3001 | Web application |
| Backend API (FastAPI) | 8001 | REST API (8000 internal) |
| PostgreSQL | 5433 | Database (5432 internal) |
| Redis | 6379 | Cache & session store |
| Nginx | 80, 443 | Reverse proxy (production) |

---

## 📖 For Different Roles

### 👨‍💻 **Frontend Developer**
1. Read: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
2. Read: [INSTALLATION.md](INSTALLATION.md) - Frontend Setup section
3. Reference: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
4. Check: [TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md) - Frontend Tests section

### 🔧 **Backend Developer**
1. Read: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
2. Read: [INSTALLATION.md](INSTALLATION.md) - Backend Setup section
3. Study: [ARCHITECTURE.md](ARCHITECTURE.md)
4. Reference: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
5. Check: [TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md) - Backend Tests section

### 🧪 **QA/Test Engineer**
1. Read: [TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md) - Complete guide
2. Reference: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
3. Setup: [INSTALLATION.md](INSTALLATION.md)

### 🚀 **DevOps/Infrastructure**
1. Read: [DEPLOYMENT.md](DEPLOYMENT.md)
2. Reference: [ARCHITECTURE.md](ARCHITECTURE.md)
3. Check: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - Technology Stack section

---

## 🤝 Contributing

Before contributing, please:
1. Read the [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) to understand the project
2. Follow the architecture patterns in [ARCHITECTURE.md](ARCHITECTURE.md)
3. Ensure all tests pass (see [TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md))
4. Update documentation if adding new features

---

## 📝 Common Tasks

### Run Tests
```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd ../backend
pytest

# All tests
docker-compose exec backend pytest
```

### Build for Production
```bash
# Build Docker images
docker-compose build

# Push to registry
docker tag signalview-backend:latest your-registry/signalview-backend:latest
docker push your-registry/signalview-backend:latest
```

### Database Migrations
```bash
# Create new migration
docker-compose exec backend alembic revision --autogenerate -m "Add new column"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Rollback
docker-compose exec backend alembic downgrade -1
```

---

## 🆘 Troubleshooting

**Port Already in Use**
```bash
# Kill process on port
lsof -ti:3001 | xargs kill -9
```

**Database Connection Issues**
```bash
# Check database is running
docker-compose ps postgres

# View logs
docker-compose logs postgres
```

**Frontend Keeps Reloading**
- Check [INSTALLATION.md](INSTALLATION.md) - Troubleshooting section

---

## 📞 Support

For issues or questions:
1. Check the relevant documentation file above
2. Review [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions
3. Check Docker service logs: `docker-compose logs -f [service-name]`
4. Review console/server logs for error messages

---

## 📄 License

[Add your license here]

---

**Last Updated**: April 2026
**Documentation Version**: 1.0
