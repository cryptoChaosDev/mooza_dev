# Mooza Music Social Network

Mooza is a next-generation music-focused social network designed to connect musicians, producers, vocalists, beatmakers, and other music enthusiasts. It aims to foster creative collaboration by enabling users to share their work, find like-minded individuals, and build teams based on shared interests and skills.

## Project Structure

```
mooza_dev/
├── frontend/              # React frontend application
├── backend/               # Node.js/Express backend API
├── deployment/            # Deployment scripts and configurations
├── docs/                  # Documentation and guides
├── .gitignore
└── README.md
```

## Features

- User profile customization with music-specific fields (genres, roles, skills, bio, city)
- Integration with external social platforms (VK, YouTube, Telegram)
- Advanced filtering and search by interests, genres, roles, and skill sets
- Interest tagging system with hierarchical categories and tag clouds
- Social features: friend requests, favorites, posts, feed, and comments
- Post creation, editing, deletion, and discussion capabilities
- Personalized recommendations based on common interests
- Responsive UI with dark theme, smooth animations, and mobile/tablet/desktop support

## Technology Stack

### Frontend
- **Framework**: React 19.1.0
- **Language**: TypeScript 4.9.5
- **Routing**: react-router-dom 7.6.3
- **Styling**: Tailwind CSS, PostCSS
- **State Management**: React Context API

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **ORM**: Prisma 5+
- **Database**: SQLite
- **Language**: TypeScript

### DevOps
- **Containerization**: Docker, docker-compose
- **Deployment**: VPS with Nginx reverse proxy

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Docker (for backend services)

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/cryptoChaosDev/mooza_dev.git
   cd mooza_dev
   ```

2. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies:**
   ```bash
   cd ../backend
   npm install
   ```

4. **Start development servers:**
   ```bash
   # In one terminal, start backend
   cd backend
   npm run dev
   
   # In another terminal, start frontend
   cd frontend
   npm start
   ```

### Deployment

For production deployment, refer to the [Deployment Guide](deployment/DEPLOYMENT_README.md).

## Documentation

- [Development Guide](docs/README-DEV.md)
- [Responsive Design Changes](docs/RESPONSIVE_DESIGN_CHANGES.md)
- [Responsive Design Summary](docs/RESPONSIVE_DESIGN_SUMMARY.md)
- [Welcome Page Redesign](docs/WELCOME_PAGE_REDIGN.md)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please open an issue on GitHub.