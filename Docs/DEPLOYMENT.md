# Deployment Guide - StreamTVDepot V2

## Deployment Overview

```
┌─────────────────────────────────────────────────────┐
│         CI/CD Pipeline                              │
│  Git Push → Tests → Build → Push Registry → Deploy  │
└─────────────────────────────────────────────────────┘
                          ↓
         ┌────────────────────────────────────┐
         │   Production Environment           │
         │                                    │
         │  ┌──────────────────────────────┐  │
         │  │ Kubernetes / Docker Swarm    │  │
         │  │  - Frontend Service          │  │
         │  │  - Backend Service           │  │
         │  │  - PostgreSQL Database       │  │
         │  │  - Redis Cache               │  │
         │  │  - Nginx Ingress             │  │
         │  └──────────────────────────────┘  │
         │                                    │
         │  ┌──────────────────────────────┐  │
         │  │ External Services            │  │
         │  │  - S3 / Cloud Storage        │  │
         │  │  - CloudFront / CDN          │  │
         │  │  - SendGrid / Email          │  │
         │  │  - Auth0 / Identity          │  │
         │  └──────────────────────────────┘  │
         └────────────────────────────────────┘
```

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code coverage > 80%
- [ ] No ESLint/PyLint warnings
- [ ] Security scan passed
- [ ] No hardcoded secrets
- [ ] Documentation updated

### Infrastructure
- [ ] Database migrations up to date
- [ ] Redis cluster configured
- [ ] SSL certificates valid
- [ ] Firewall rules configured
- [ ] Backup strategy in place
- [ ] Monitoring/logging configured

### Configuration
- [ ] Environment variables reviewed
- [ ] Database connection strings verified
- [ ] API keys rotated
- [ ] CORS origins updated
- [ ] Rate limiting configured
- [ ] Error monitoring setup

---

## Docker Image Building

### Build Docker Images Locally

#### Backend Image
```bash
cd backend

# Build image
docker build -t streamtvdepot/backend:latest .

# Test locally
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/streamtvdepot \
  -e REDIS_URL=redis://redis:6379 \
  streamtvdepot/backend:latest

# Tag for registry
docker tag streamtvdepot/backend:latest your-registry.azurecr.io/streamtvdepot/backend:1.0.0
```

#### Frontend Image
```bash
cd ../frontend

# Build image
docker build -t streamtvdepot/frontend:latest .

# Test locally
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api/v1 \
  streamtvdepot/frontend:latest

# Tag for registry
docker tag streamtvdepot/frontend:latest your-registry.azurecr.io/streamtvdepot/frontend:1.0.0
```

### Dockerfile Best Practices

#### Backend Dockerfile (Optimized)
```dockerfile
# File: backend/Dockerfile

# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /root/.local /root/.local
COPY app/ ./app
COPY alembic/ ./alembic
COPY alembic.ini .

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### Frontend Dockerfile (Optimized)
```dockerfile
# File: frontend/Dockerfile

# Stage 1: Builder
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY . .

# Build Next.js app
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json .
RUN npm ci --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["npm", "start"]
```

---

## Push to Container Registry

### Azure Container Registry (ACR)

```bash
# Login to ACR
az acr login --name your-registry

# Push backend image
docker push your-registry.azurecr.io/streamtvdepot/backend:1.0.0

# Push frontend image
docker push your-registry.azurecr.io/streamtvdepot/frontend:1.0.0

# List images
az acr repository list --name your-registry
```

### AWS Elastic Container Registry (ECR)

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin your-registry.dkr.ecr.us-east-1.amazonaws.com

# Create repositories
aws ecr create-repository --repository-name streamtvdepot/backend --region us-east-1
aws ecr create-repository --repository-name streamtvdepot/frontend --region us-east-1

# Push images
docker push your-registry.dkr.ecr.us-east-1.amazonaws.com/streamtvdepot/backend:1.0.0
docker push your-registry.dkr.ecr.us-east-1.amazonaws.com/streamtvdepot/frontend:1.0.0
```

### Docker Hub

```bash
# Login to Docker Hub
docker login

# Push images
docker push yourusername/streamtvdepot-backend:1.0.0
docker push yourusername/streamtvdepot-frontend:1.0.0
```

---

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (EKS, AKS, GKE, or on-premises)
- kubectl configured
- Helm (optional but recommended)

### Namespace Setup
```bash
# Create namespace
kubectl create namespace streamtvdepot

# Set default namespace
kubectl config set-context --current --namespace=streamtvdepot
```

### Secrets Configuration
```bash
# Create database secret
kubectl create secret generic db-credentials \
  --from-literal=DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/streamtvdepot \
  -n streamtvdepot

# Create Redis secret
kubectl create secret generic redis-credentials \
  --from-literal=REDIS_URL=redis://redis:6379 \
  -n streamtvdepot

# Create JWT secret
kubectl create secret generic jwt-secret \
  --from-literal=SECRET_KEY=$(openssl rand -hex 32) \
  -n streamtvdepot
```

### ConfigMap Setup
```yaml
# File: k8s/configmap.yaml

apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: streamtvdepot
data:
  APP_NAME: "StreamTVDepot"
  API_V1_PREFIX: "/api/v1"
  ENVIRONMENT: "production"
  DEBUG: "false"
  LOG_LEVEL: "info"
```

Apply ConfigMap:
```bash
kubectl apply -f k8s/configmap.yaml
```

### PostgreSQL Deployment
```yaml
# File: k8s/postgres-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: streamtvdepot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: streamtvdepot
        - name: POSTGRES_USER
          value: streamtvdepot
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: POSTGRES_PASSWORD
        volumeMounts:
        - name: db-storage
          mountPath: /var/lib/postgresql/data
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U streamtvdepot
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: db-storage
        persistentVolumeClaim:
          claimName: postgres-pvc

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: streamtvdepot
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi

---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: streamtvdepot
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  type: ClusterIP
```

### Backend Deployment
```yaml
# File: k8s/backend-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: streamtvdepot
spec:
  replicas: 3  # Scale horizontally
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: your-registry.azurecr.io/streamtvdepot/backend:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: REDIS_URL
        - name: APP_NAME
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: APP_NAME
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: streamtvdepot
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: streamtvdepot
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Frontend Deployment
```yaml
# File: k8s/frontend-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: streamtvdepot
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: your-registry.azurecr.io/streamtvdepot/frontend:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_BASE_URL
          value: "https://api.streamtvdepot.com/api/v1"
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 400m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: streamtvdepot
spec:
  selector:
    app: frontend
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

### Ingress Configuration
```yaml
# File: k8s/ingress.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: streamtvdepot-ingress
  namespace: streamtvdepot
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - streamtvdepot.com
    - api.streamtvdepot.com
    secretName: streamtvdepot-tls
  rules:
  - host: streamtvdepot.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 3000
  - host: api.streamtvdepot.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8000
```

### Deploy to Kubernetes
```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get deployments -n streamtvdepot
kubectl get pods -n streamtvdepot
kubectl get services -n streamtvdepot

# View logs
kubectl logs -f deployment/backend -n streamtvdepot
kubectl logs -f deployment/frontend -n streamtvdepot

# Scale deployment
kubectl scale deployment backend --replicas=5 -n streamtvdepot

# Update image
kubectl set image deployment/backend \
  backend=your-registry.azurecr.io/streamtvdepot/backend:1.1.0 \
  -n streamtvdepot

# Check rollout status
kubectl rollout status deployment/backend -n streamtvdepot
```

---

## Database Migrations in Production

### Pre-Deployment Migrations
```bash
# Run migrations before deployment
kubectl run migration-job \
  --image=your-registry.azurecr.io/streamtvdepot/backend:1.0.0 \
  --env="DATABASE_URL=postgresql+asyncpg://..." \
  -- alembic upgrade head

# Verify migration
kubectl logs migration-job
```

### Automated Migrations
```yaml
# File: k8s/migration-job.yaml

apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: streamtvdepot
spec:
  template:
    spec:
      containers:
      - name: migration
        image: your-registry.azurecr.io/streamtvdepot/backend:1.0.0
        command: ["alembic", "upgrade", "head"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: DATABASE_URL
      restartPolicy: Never
  backoffLimit: 3
```

---

## Monitoring & Logging

### Prometheus Metrics
```yaml
# File: k8s/prometheus-configmap.yaml

apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: streamtvdepot
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'backend'
      kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
          - streamtvdepot
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: backend
```

### ELK Stack (Elasticsearch, Logstash, Kibana)
```bash
# Install ELK
helm repo add elastic https://helm.elastic.co
helm install elastic-stack elastic/elasticsearch -n streamtvdepot

# Configure log shipping
# Add logging sidecar to deployments
```

### Application Monitoring
```python
# File: backend/app/monitoring.py

from prometheus_client import Counter, Histogram
import time

request_count = Counter('streamtvdepot_requests_total', 'Total requests')
request_duration = Histogram('streamtvdepot_request_duration_seconds', 'Request duration')

@app.middleware("http")
async def add_metrics(request: Request, call_next):
    start = time.time()
    request_count.inc()
    
    response = await call_next(request)
    duration = time.time() - start
    request_duration.observe(duration)
    
    return response
```

---

## Health Checks & Recovery

### Liveness Probe
Restarts container if unhealthy:
```bash
curl http://localhost:8000/health
```

### Readiness Probe
Removes from load balancer if unhealthy:
```bash
curl http://localhost:8000/ready
```

### Recovery Procedures
```bash
# Pod restart
kubectl delete pod backend-xyz -n streamtvdepot

# Service restart
kubectl rollout restart deployment/backend -n streamtvdepot

# Manual failover
kubectl cordon node-1
kubectl drain node-1 --ignore-daemonsets
```

---

## Backup & Disaster Recovery

### PostgreSQL Backup
```bash
# Backup to file
kubectl exec -it postgres-pod -n streamtvdepot -- \
  pg_dump -U streamtvdepot streamtvdepot > backup.sql

# Backup to S3
kubectl run backup-job \
  --image=your-registry.azurecr.io/streamtvdepot/backend:1.0.0 \
  -- bash -c "pg_dump -U streamtvdepot streamtvdepot | aws s3 cp - s3://backups/db-$(date +%s).sql"

# Restore from backup
psql -U streamtvdepot streamtvdepot < backup.sql
```

### Automated Daily Backups
```yaml
# File: k8s/backup-cronjob.yaml

apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-db-backup
  namespace: streamtvdepot
spec:
  schedule: "0 2 * * *"  # 2 AM UTC daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -U streamtvdepot streamtvdepot | \
              aws s3 cp - s3://streamtvdepot-backups/db-$(date +%Y%m%d-%H%M%S).sql.gz --sse AES256
            env:
            - name: PGHOST
              value: postgres
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: ACCESS_KEY_ID
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: SECRET_ACCESS_KEY
          restartPolicy: OnFailure
      backoffLimit: 3
```

---

## Performance Tuning

### Database Connection Pool
```python
# backend/app/core/database.py

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=20,               # Connection pool size
    max_overflow=10,            # Max overflow connections
    pool_recycle=3600,          # Recycle connections after 1 hour
    pool_pre_ping=True,         # Test connections before using
)
```

### Redis Optimization
```python
# backend/app/core/cache.py

redis = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf8",
    decode_responses=True,
    max_connections=50,         # Max connections
    health_check_interval=30    # Health check interval
)
```

### CDN Configuration
```yaml
# CloudFront Distribution

Distribution:
  DomainName: streamtvdepot.com
  Origins:
    - DomainName: d123.cloudfront.net
      S3Origin:
        OriginAccessIdentity: origin-access-identity/cloudfront/ABCDEFGH
  CacheBehaviors:
    - PathPattern: /static/*
      ViewerProtocolPolicy: https-only
      Compress: true
      DefaultTTL: 86400
      MaxTTL: 31536000
    - PathPattern: /api/*
      ViewerProtocolPolicy: https-only
      AllowedMethods: [GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE]
      DefaultTTL: 0
      MaxTTL: 0
      Compress: true
```

---

## Security Hardening

### Network Policies
```yaml
# File: k8s/network-policy.yaml

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
  namespace: streamtvdepot
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
```

### Pod Security Policy
```yaml
# File: k8s/pod-security-policy.yaml

apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'MustRunAs'
  fsGroup:
    rule: 'MustRunAs'
  readOnlyRootFilesystem: false
```

---

## Rollback Procedures

### Quick Rollback
```bash
# Show rollout history
kubectl rollout history deployment/backend -n streamtvdepot

# Rollback to previous version
kubectl rollout undo deployment/backend -n streamtvdepot

# Rollback to specific revision
kubectl rollout undo deployment/backend --to-revision=2 -n streamtvdepot

# Check rollout status
kubectl rollout status deployment/backend -n streamtvdepot
```

---

## Post-Deployment Verification

```bash
# Check all pods are running
kubectl get pods -n streamtvdepot

# Verify services
kubectl get services -n streamtvdepot

# Check ingress
kubectl get ingress -n streamtvdepot

# View recent events
kubectl get events -n streamtvdepot --sort-by='.lastTimestamp'

# Test API endpoint
curl https://api.streamtvdepot.com/health

# View application logs
kubectl logs -f deployment/backend -n streamtvdepot
kubectl logs -f deployment/frontend -n streamtvdepot
```

---

## Related Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Local development setup
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture
- **[TESTING_DOCUMENTATION.md](TESTING_DOCUMENTATION.md)** - Pre-deployment testing

---

**Status**: ✅ Deployment Ready
**Next**: Monitor application and review logs for issues
