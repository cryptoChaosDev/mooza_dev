# Mooza Deployment Checklist

Use this checklist to ensure you've completed all necessary steps for a successful deployment.

## Pre-Deployment Checklist

- [ ] **VPS Server Ready**
  - [ ] Linux VPS provisioned (Ubuntu 20.04+ recommended)
  - [ ] SSH access configured
  - [ ] Firewall configured (ports 22, 80, 443 open)
  - [ ] Sufficient resources (1 CPU, 1GB RAM minimum)

- [ ] **Domain and DNS (Optional)**
  - [ ] Domain registered (if using custom domain)
  - [ ] DNS A record pointing to VPS IP

- [ ] **Local Environment**
  - [ ] Git installed
  - [ ] SSH client available
  - [ ] SCP client available
  - [ ] Private SSH key (if using key authentication)

## Deployment Process

- [ ] **Transfer Deployment Script**
  - [ ] Copy `deploy-to-vps.sh` to VPS
  - [ ] Make script executable (`chmod +x deploy-to-vps.sh`)

- [ ] **Run Deployment**
  - [ ] Execute deployment script
  - [ ] Monitor progress for errors

- [ ] **Verify Deployment**
  - [ ] Check that all services are running
  - [ ] Test API endpoint (`curl http://localhost:4000/health`)
  - [ ] Access web application in browser
  - [ ] Create test user and post

## Post-Deployment Configuration

- [ ] **Security Hardening**
  - [ ] SSH key-only authentication
  - [ ] Fail2ban installed and configured
  - [ ] Automatic security updates enabled
  - [ ] Regular backups configured

- [ ] **SSL Certificate (HTTPS)**
  - [ ] Install Certbot: `sudo apt install certbot python3-certbot-nginx`
  - [ ] Obtain certificate: `sudo certbot --nginx -d yourdomain.com`
  - [ ] Verify HTTPS access

- [ ] **Monitoring and Maintenance**
  - [ ] Set up log rotation
  - [ ] Configure automatic backups
  - [ ] Set up monitoring alerts
  - [ ] Document recovery procedures

## Testing Checklist

- [ ] **Frontend Tests**
  - [ ] Homepage loads correctly
  - [ ] User registration works
  - [ ] User login works
  - [ ] Profile creation/editing works
  - [ ] Post creation works
  - [ ] Post editing/deletion works
  - [ ] Friend functionality works
  - [ ] Search functionality works

- [ ] **Backend/API Tests**
  - [ ] Auth endpoints functional
  - [ ] Profile endpoints functional
  - [ ] Post endpoints functional
  - [ ] Friendship endpoints functional
  - [ ] Database persistence verified

- [ ] **Performance Tests**
  - [ ] Page load times acceptable
  - [ ] API response times acceptable
  - [ ] Concurrent user handling tested

## Common Issues and Solutions

- [ ] **Port Conflicts**
  - [ ] Check for services using ports 80, 443, 4000
  - [ ] Stop conflicting services or change ports

- [ ] **Permission Issues**
  - [ ] Ensure proper file ownership
  - [ ] Check Docker socket permissions
  - [ ] Verify database file permissions

- [ ] **Network Issues**
  - [ ] Verify firewall rules
  - [ ] Check DNS resolution
  - [ ] Test connectivity to external services

## Success Criteria

- [ ] Application accessible via web browser
- [ ] All core features functional
- [ ] User data persists correctly
- [ ] API responds correctly to requests
- [ ] No critical errors in logs
- [ ] SSL certificate valid (if configured)

## Documentation and Handover

- [ ] **System Documentation**
  - [ ] Architecture diagram
  - [ ] Service descriptions
  - [ ] Configuration file locations
  - [ ] Customization instructions

- [ ] **Operations Documentation**
  - [ ] Backup procedures
  - [ ] Recovery procedures
  - [ ] Update procedures
  - [ ] Monitoring setup

- [ ] **Contact Information**
  - [ ] Technical contact
  - [ ] Support contact
  - [ ] Vendor contacts (if applicable)

---

✅ **Deployment Complete**: All checklist items verified and functioning correctly