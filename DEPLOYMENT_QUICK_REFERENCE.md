# Mooza - Quick Deployment Reference

## 🚀 Fastest Way to Deploy

### Option 1: Automated Deployment Script
```bash
# Linux/Mac
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh

# Windows (PowerShell)
.\deploy-to-vps.ps1
```

### Option 2: Manual 5-Minute Setup
```bash
# 1. SSH to your VPS
ssh root@your.vps.ip

# 2. Run one-liner installation
curl -fsSL https://raw.githubusercontent.com/your-repo/mooza-dev/main/install.sh | bash
```

## 📋 Pre-Deployment Checklist

- [ ] VPS with Ubuntu 20.04+ (2GB RAM minimum)
- [ ] Domain name configured
- [ ] Git repository URL
- [ ] SSH key access to VPS
- [ ] 20GB+ free disk space

## 🔧 Configuration

### Environment Variables
```
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://user:password@db:5432/mooza
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://yourdomain.com
```

## 📊 Deployment Status

After deployment, check:
```bash
# View running containers
docker-compose ps

# Check logs
docker-compose logs -f

# Test API
curl http://localhost:3001/api/health
```

## 🆘 Common Commands

| Task | Command |
|------|---------|
| View logs | `docker-compose logs -f` |
| Restart services | `docker-compose restart` |
| Stop services | `docker-compose down` |
| Update code | `git pull && docker-compose up -d --build` |
| Database backup | `docker-compose exec db pg_dump -U postgres mooza_db > backup.sql` |
| View disk usage | `df -h` |

## 🔗 Useful Links

- Full Guide: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- Docker Docs: https://docs.docker.com
- Nginx Guide: https://nginx.org/
- Let's Encrypt: https://letsencrypt.org/

## 💡 Pro Tips

1. **Always backup before updates**
   ```bash
   docker-compose exec db pg_dump -U postgres mooza_db | gzip > backup_$(date +%s).sql.gz
   ```

2. **Monitor resource usage**
   ```bash
   docker stats
   df -h
   ```

3. **Enable auto-renewal for SSL**
   ```bash
   certbot renew --dry-run
   ```

4. **Setup daily backups**
   ```bash
   (crontab -l 2>/dev/null; echo "0 2 * * * /path/to/backup.sh") | crontab -
   ```

## ❌ Troubleshooting

### Services won't start
```bash
docker-compose down -v
docker-compose up -d --build
docker-compose logs
```

### Database connection error
```bash
docker-compose exec server npm run prisma:migrate:status
docker-compose restart db
```

### SSL certificate issues
```bash
certbot renew --force-renewal
systemctl reload nginx
```

## 📞 Support

Check logs first:
```bash
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f db
```

---

**Need help?** See the full [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
