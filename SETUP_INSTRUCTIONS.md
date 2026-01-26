# 🚀 Mooza - Git & VPS Deployment Complete!

## ✅ What We've Done

### 1. **Git Repository Initialized** ✓
Your project has been committed to git with all deployment scripts:
```
Commits:
- 5014dd9: Add VPS deployment scripts and documentation
- 4d5121f: Initial commit: Mooza project with Docker setup
```

### 2. **Deployment Scripts Created** ✓

#### For Linux/Mac:
- **`deploy-to-vps.sh`** - Interactive bash script for full automated deployment
- **`install.sh`** - One-liner installation (run: `curl -fsSL https://... | bash`)

#### For Windows (PowerShell):
- **`deploy-to-vps.ps1`** - PowerShell deployment script

#### Documentation:
- **`DEPLOYMENT_GUIDE.md`** - Comprehensive deployment guide with all details
- **`DEPLOYMENT_QUICK_REFERENCE.md`** - Quick command reference

## 🚀 How to Deploy

### **Option 1: Fastest - Use Automated Script (Recommended)**

On your local machine:

```bash
# Linux/Mac
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh

# Windows (PowerShell)
.\deploy-to-vps.ps1
```

The script will:
- Prompt for VPS details
- SSH to your VPS
- Install all dependencies
- Clone your repository
- Build Docker containers
- Setup Nginx reverse proxy (optional)
- Setup SSL with Let's Encrypt (optional)

### **Option 2: Manual Installation on VPS**

SSH to your VPS and run the one-liner:

```bash
ssh root@your.vps.ip
curl -fsSL https://raw.githubusercontent.com/your-username/mooza-dev/main/install.sh | bash
```

The script will:
- Install Node.js, Docker, Docker Compose, Nginx, Certbot
- Clone your repository
- Build and start all services
- Optionally setup Nginx and SSL

### **Option 3: Manual Step-by-Step**

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed manual instructions.

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] **VPS/Server**
  - Ubuntu 20.04 or later (recommended)
  - Minimum 2GB RAM
  - 20GB+ disk space
  - SSH access (port 22 or custom)

- [ ] **Git Repository**
  - Project pushed to GitHub/GitLab/Gitea
  - Repository URL ready
  - SSH key configured (optional but recommended)

- [ ] **Domain Name** (optional but recommended for SSL)
  - Domain pointing to your VPS IP
  - DNS configured

- [ ] **Credentials Ready**
  - VPS hostname/IP
  - VPS username
  - VPS port (default: 22)
  - Git repository URL

## 🎯 What Gets Deployed

### Services
- **Frontend** (React/Vite) - Port 3000
- **Backend API** (Node.js) - Port 3001
- **Database** (PostgreSQL) - Internal
- **Nginx** (Reverse Proxy) - Port 80/443

### Features
- ✅ Docker containerization
- ✅ Automatic SSL/HTTPS (Let's Encrypt)
- ✅ Nginx reverse proxy
- ✅ PostgreSQL database
- ✅ File upload support
- ✅ JWT authentication

## 📚 File Structure

```
mooza-dev/
├── deploy-to-vps.sh          # Linux/Mac deployment script
├── deploy-to-vps.ps1         # Windows PowerShell script
├── install.sh                # One-liner installation
├── DEPLOYMENT_GUIDE.md       # Full deployment documentation
├── DEPLOYMENT_QUICK_REFERENCE.md  # Quick commands
├── docker-compose.yml        # Docker services configuration
├── client/                   # Frontend (React)
├── server/                   # Backend (Node.js/Express)
└── SETUP_INSTRUCTIONS.md     # This file
```

## 🔧 Common Commands After Deployment

### SSH to VPS
```bash
ssh -p 22 root@your.vps.ip
cd /opt/mooza
```

### View Logs
```bash
docker-compose logs -f              # All services
docker-compose logs -f server       # Just backend
docker-compose logs -f client       # Just frontend
```

### Stop/Start Services
```bash
docker-compose down                 # Stop
docker-compose up -d               # Start
docker-compose restart             # Restart
```

### View Status
```bash
docker-compose ps                  # Show running containers
docker stats                       # Resource usage
```

### Database Operations
```bash
# Backup
docker-compose exec -T db pg_dump -U postgres mooza_db > backup.sql

# Restore
docker-compose exec -T db psql -U postgres mooza_db < backup.sql

# Check status
docker-compose exec server npm run prisma:migrate:status
```

### Update Application
```bash
cd /opt/mooza
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 🔐 Security Checklist

After deployment, verify:

- [ ] HTTPS/SSL is working
- [ ] Firewall is configured
- [ ] Database password is changed
- [ ] JWT secret is strong (random string)
- [ ] Backups are scheduled
- [ ] Monitoring is setup
- [ ] SSL auto-renewal is enabled

## 📞 Troubleshooting

### Services won't start
```bash
docker-compose logs
docker-compose down -v
docker-compose up -d --build
```

### Database issues
```bash
docker-compose logs db
docker-compose restart db
```

### SSL certificate issues
```bash
certbot renew --force-renewal
systemctl reload nginx
```

### Can't access application
```bash
# Check if containers are running
docker-compose ps

# Check Nginx status
systemctl status nginx

# Check firewall
sudo ufw status
```

## 📖 Documentation

- **Full Guide**: See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Quick Reference**: See [DEPLOYMENT_QUICK_REFERENCE.md](./DEPLOYMENT_QUICK_REFERENCE.md)
- **README**: See [README.md](./README.md)

## 🎓 Next Steps

1. **Push to Git** ✓ (Already done!)
   ```bash
   git push origin main
   ```

2. **Choose Deployment Method**
   - Use `deploy-to-vps.sh` for guided deployment
   - Or manually follow [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

3. **Deploy to VPS**
   - Run the script and follow prompts
   - Or SSH to VPS and run install.sh

4. **Post-Deployment Setup**
   - Update DNS records
   - Configure SSL certificate
   - Setup backups
   - Monitor application

5. **Optional Enhancements**
   - Setup CI/CD with GitHub Actions
   - Add monitoring (Prometheus/Grafana)
   - Setup email notifications
   - Add CDN integration

## 🌐 Accessing Your Application

After deployment, access via:
- **Frontend**: https://yourdomain.com
- **API**: https://yourdomain.com/api
- **Health Check**: https://yourdomain.com/api/health

## 📊 Monitoring

Monitor your deployment at:
- **Docker Dashboard**: `docker stats`
- **System Resources**: `df -h`, `htop`
- **Logs**: `docker-compose logs -f`
- **Processes**: `docker-compose ps`

## 🆘 Getting Help

1. Check logs: `docker-compose logs -f`
2. Read [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
3. Check Docker documentation: https://docs.docker.com
4. Check Nginx logs: `/var/log/nginx/error.log`

## 📝 Notes

- Keep `.env` file secure and never commit to git
- Regular backups are essential
- Monitor disk space regularly
- Keep system packages updated
- Enable SSL/HTTPS for security

---

## 🎉 You're All Set!

Your Mooza application is ready for deployment! 

**Next action:** Run the deployment script or follow the DEPLOYMENT_GUIDE.md

Questions? Check the documentation files or review the deployment guide.

Happy deploying! 🚀
