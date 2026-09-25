# Installation & Setup Guide - SignalView V2

## Prerequisites

Before you begin, ensure you have the following installed:

### System Requirements
- **OS**: macOS, Linux, or Windows (WSL2 recommended)
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: At least 10GB free

### Required Software
- **Docker Desktop**: [Download](https://www.docker.com/products/docker-desktop/) (includes Docker & Docker Compose)
- **Git**: [Download](https://git-scm.com/)
- **Node.js**: v18 or higher ([Download](https://nodejs.org/))
- **Python**: 3.11+ (if running backend locally without Docker)
- **Code Editor**: VS Code or your preference

### Verify Installation
```bash
# Check Docker
docker --version
docker-compose --version

# Check Node.js
node --version
npm --version

# Check Git
git --version

# Check Python (optional, if running locally)
python3 --version
```

---

## Project Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/signalview.git
cd signalview/V2
```

### 2. Environment Configuration

#### Create `.env` file from template
```bash
cp .env.example .env
```

#### Edit `.env` with your configuration
```bash
# Database Configuration
POSTGRES_DB=signalview
POSTGRES_USER=signalview
POSTGRES_PASSWORD=your_secure_password_here

# Backend Configuration
API_V1_PREFIX=/api/v1
APP_NAME=SignalView
DEBUG=true  # Set to false in production

# Frontend Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api/v1

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your_app_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Docker Setup (Recommended)

### Quick Start - All Services
```bash
# Start all services
docker-compose up

# In another terminal, you can run:
docker-compose ps          # View running services
docker-compose logs -f     # View logs

# Access:
# Frontend: http://localhost:3001
# Backend API: http://localhost:8001
# API Docs: http://localhost:8001/docs
# API ReDoc: http://localhost:8001/redoc
```

### Individual Service Container Commands

#### Database Initialization
```bash
# Run migrations
docker-compose exec backend alembic upgrade head

# Create a new migration
docker-compose exec backend alembic revision --autogenerate -m "Describe change"

# View migration status
docker-compose exec backend alembic current
```

#### Backend Service
```bash
# View backend logs
docker-compose logs -f backend

# Run backend tests
docker-compose exec backend pytest

# Access backend shell
docker-compose exec backend bash
```

#### Frontend Service
```bash
# View frontend logs
docker-compose logs -f frontend

# Run frontend tests
docker-compose exec frontend npm test

# Access frontend shell
docker-compose exec frontend bash
```

#### Database Service
```bash
# Access PostgreSQL CLI
docker-compose exec postgres psql -U signalview -d signalview

# Common PostgreSQL commands:
# \dt                  - List tables
# \d table_name       - Describe table
# SELECT * FROM users; - Query data
# \q                  - Exit psql
```

#### Redis Service
```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Common Redis commands:
# PING                    - Test connection
# KEYS *                  - List all keys
# GET key_name            - Get value
# FLUSHDB                 - Clear database
# exit                    - Exit redis-cli
```

---

## Local Development Setup (Without Docker)

### Backend Setup (FastAPI)

#### 1. Create Python Virtual Environment
```bash
cd backend

# macOS/Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

#### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 3. Database Setup
```bash
# Ensure PostgreSQL is running on localhost:5432
# Create database: createdb signalview

# Run migrations
alembic upgrade head

# Verify: psql -U signalview -d signalview -c "SELECT version();"
```

#### 4. Run Backend Server
```bash
uvicorn app.main:app --reload --port 8000

# Output should show:
# Uvicorn running on http://127.0.0.1:8000
# API docs: http://127.0.0.1:8000/docs
```

#### 5. Deactivate Virtual Environment (when done)
```bash
deactivate
```

### Frontend Setup (Next.js)

#### 1. Install Dependencies
```bash
cd frontend
npm install
# or if using Bun
bun install
```

#### 2. Environment Configuration
```bash
# .env.local file already exists, verify:
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

#### 3. Run Development Server
```bash
npm run dev

# Output should show:
# ▲ Next.js 16.2.2
# - Local: http://localhost:3001
# - Network: http://192.168.x.x:3001
```

#### 4. Open in Browser
Visit: http://localhost:3001

---

## Database Setup

### Docker (Automatic)
The database is automatically initialized in Docker. No additional setup needed.

### Local PostgreSQL

#### macOS (using Homebrew)
```bash
# Install PostgreSQL
brew install postgresql

# Start PostgreSQL service
brew services start postgresql

# Create database and user
createdb signalview
createuser signalview
psql -d postgres -c "ALTER USER signalview WITH PASSWORD 'signalview_secret';"
psql -d postgres -c "ALTER USER signalview WITH SUPERUSER;"

# Verify
psql -U signalview -d signalview -c "SELECT 1;"
```

#### Linux (Ubuntu/Debian)
```bash
# Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Access PostgreSQL
sudo -u postgres psql

# Inside psql:
CREATE DATABASE signalview;
CREATE USER signalview WITH PASSWORD 'signalview_secret';
ALTER ROLE signalview SET client_encoding TO 'utf8';
ALTER ROLE signalview SET default_transaction_isolation TO 'read committed';
ALTER ROLE signalview SET default_transaction_deferrable TO on;
ALTER ROLE signalview SET default_transaction_read_only TO off;
GRANT ALL PRIVILEGES ON DATABASE signalview TO signalview;
\q
```

#### Linux (CentOS/RHEL)
```bash
# Install PostgreSQL
sudo yum install postgresql-server postgresql-contrib

# Initialize database cluster
sudo postgresql-setup initdb

# Start PostgreSQL
sudo systemctl start postgresql

# Create database and user (same as Ubuntu)
sudo -u postgres psql
# ... [run same SQL commands as Ubuntu]
```

---

## Redis Setup

### Using Docker (Recommended)
```bash
docker-compose up redis

# Verify: docker-compose ps redis
```

### Local Installation

#### macOS (using Homebrew)
```bash
brew install redis
brew services start redis

# Verify
redis-cli ping  # Should respond with PONG
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server

# Verify
redis-cli ping  # Should respond with PONG
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port
# Change 3001 to your port number

# macOS/Linux
lsof -ti:3001 | xargs kill -9

# Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process
```

### Docker Container Issues

#### Container won't start
```bash
# Check container logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres

# Rebuild images
docker-compose down
docker-compose build --no-cache
docker-compose up
```

#### Out of disk space
```bash
# Clean up Docker resources
docker system prune -a

# Remove unused volumes
docker volume prune
```

### Database Connection Issues

#### Cannot connect to PostgreSQL
```bash
# Check if service is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Verify credentials in .env
grep POSTGRES .env

# Test connection manually
psql -h localhost -p 5433 -U signalview -d signalview
```

#### Migrations failed
```bash
# Check migration history
docker-compose exec backend alembic history

# Rollback one migration
docker-compose exec backend alembic downgrade -1

# Try upgrade again
docker-compose exec backend alembic upgrade head
```

### Frontend Issues

#### Dependencies not installed
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

#### Next.js dev server keeps reloading
```bash
# Check if middleware.ts exists (should be proxy.ts)
ls *.ts

# If found, rename:
mv middleware.ts proxy.ts

# Restart dev server
npm run dev
```

#### Port 3001 already in use
```bash
# Use different port
npm run dev -- -p 3002

# Or kill existing process
lsof -ti:3001 | xargs kill -9
```

### Backend Issues

#### Dependencies conflict
```bash
# Clear pip cache and reinstall
pip cache purge
pip install --force-reinstall -r requirements.txt
```

#### API not accessible
```bash
# Check if backend is running
curl http://localhost:8000/health

# Check logs
docker-compose logs backend

# Verify CORS settings
# Should include your frontend URL
```

---

## Starting Development

### Common Development Tasks

#### Run all services
```bash
docker-compose up
# or for background
docker-compose up -d
```

#### Run only frontend
```bash
cd frontend
npm run dev
# Requires backend running separately or via docker-compose
```

#### Run only backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Run tests
```bash
# Frontend tests
docker-compose exec frontend npm test

# Backend tests
docker-compose exec backend pytest

# All tests
npm test  # Run from root in both projects
```

#### Build for production
```bash
# Frontend
docker-compose build frontend

# Backend
docker-compose build backend

# All
docker-compose build
```

#### Stop all services
```bash
docker-compose down

# Also remove volumes
docker-compose down -v

# Remove volumes and force
docker-compose down -v --remove-orphans
```

---

## Next Steps

After successful installation:

1. **Read the Architecture**: Check [ARCHITECTURE.md](ARCHITECTURE.md)
2. **Explore APIs**: Visit http://localhost:8001/docs (Swagger)
3. **Run Tests**: Follow [TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)
4. **Start Developing**: Create your first feature branch

---

## Useful Commands Cheat Sheet

```bash
# Docker Commands
docker-compose up -d          # Start services in background
docker-compose down           # Stop all services
docker-compose logs -f        # Follow logs for all services
docker-compose ps             # List running services
docker-compose exec backend bash  # Access container shell

# Frontend Commands
cd frontend && npm run dev    # Start dev server on 3001
npm test                      # Run tests
npm run build                 # Build for production
npm run lint                  # Run ESLint

# Backend Commands
uvicorn app.main:app --reload  # Start dev server on 8000
pytest                        # Run tests
alembic upgrade head          # Apply migrations
alembic downgrade -1          # Rollback last migration

# Database Commands
psql -U signalview -d signalview  # Access database
redis-cli                     # Access Redis
```

---

## Support

If you encounter issues:
1. Check the Troubleshooting section above
2. Review Docker logs: `docker-compose logs`
3. Verify environment variables in `.env`
4. Check port availability
5. Ensure all prerequisites are installed

For more help, refer to other documentation files:
- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Project structure and features
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design details
- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - Running tests

---

**Status**: ✅ Setup Complete
**Next Guide**: [ARCHITECTURE.md](ARCHITECTURE.md)
