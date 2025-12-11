#!/bin/bash

# Mooza PostgreSQL Setup Script
# Fixes PostgreSQL database configuration for VPS deployment

echo "========================================="
echo "  Mooza PostgreSQL Setup Script"
echo "========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Please use sudo."
        exit 1
    fi
}

# Check deployment directory
check_deployment_dir() {
    log "Checking deployment directory..."
    if [ ! -d "/opt/mooza" ]; then
        error "Deployment directory /opt/mooza not found"
        exit 1
    fi
    
    cd /opt/mooza
    
    if [ ! -f "backend/prisma/schema.prisma" ]; then
        error "Prisma schema not found"
        exit 1
    fi
    
    success "Deployment directory verified"
}

# Update Prisma schema for PostgreSQL
update_prisma_schema() {
    log "Updating Prisma schema for PostgreSQL..."
    
    # Check if the schema is already configured for PostgreSQL
    if grep -q "provider = \"postgresql\"" backend/prisma/schema.prisma; then
        success "Prisma schema already configured for PostgreSQL"
        return 0
    fi
    
    # Update the datasource provider to PostgreSQL
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' backend/prisma/schema.prisma
    
    if grep -q "provider = \"postgresql\"" backend/prisma/schema.prisma; then
        success "Prisma schema updated to use PostgreSQL"
    else
        error "Failed to update Prisma schema"
        return 1
    fi
}

# Update backend .env file
update_env_file() {
    log "Updating backend .env file..."
    
    # Create/update the backend .env file
    cat > backend/.env << 'EOF'
DATABASE_URL="postgresql://user:password@db:5432/mooza?schema=public"
PORT=4000
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
EOF
    
    success "Backend .env file updated"
}

# Run Prisma migrations
run_prisma_migrations() {
    log "Running Prisma migrations..."
    
    # Make sure the services are running
    log "Starting services..."
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 15
    
    # Run the Prisma migrations
    log "Executing Prisma migrations..."
    if sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml exec api npx prisma migrate dev --name init_db_setup; then
        success "Prisma migrations completed"
    else
        error "Failed to run Prisma migrations"
        return 1
    fi
    
    # Generate the Prisma client
    log "Generating Prisma client..."
    if sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml exec api npx prisma generate; then
        success "Prisma client generated"
    else
        error "Failed to generate Prisma client"
        return 1
    fi
}

# Check database tables
check_database_tables() {
    log "Checking database tables..."
    
    # Check if the tables were created
    if sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml exec db psql -U user -d mooza -c "\dt" > /tmp/db_tables.log 2>&1; then
        if grep -q "User\|Post\|Friendship" /tmp/db_tables.log; then
            success "Database tables created successfully"
            cat /tmp/db_tables.log
        else
            warning "No tables found in database"
        fi
    else
        error "Failed to check database tables"
        cat /tmp/db_tables.log
        return 1
    fi
    
    # Clean up
    rm -f /tmp/db_tables.log
}

# Restart services
restart_services() {
    log "Restarting services..."
    
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
    
    success "Services restarted"
}

# Main execution
main() {
    check_root
    check_deployment_dir
    update_prisma_schema
    update_env_file
    run_prisma_migrations
    check_database_tables
    restart_services
    
    echo
    success "PostgreSQL setup completed!"
    log "You should now be able to create posts and see them in the feed."
}

# Run main function
main "$@"