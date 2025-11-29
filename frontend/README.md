# Mooza Frontend

This is the frontend application for the Mooza Music Social Network, built with React, TypeScript, and Tailwind CSS.

## Technology Stack

- **Framework**: React 19.1.0
- **Language**: TypeScript 4.9.5
- **Routing**: react-router-dom 7.6.3
- **Styling**: Tailwind CSS, PostCSS
- **State Management**: React Context API
- **Build Tool**: Create React App (react-scripts 5.0.1)

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation
```bash
npm install
```

### Development
```bash
npm start
```

### Build
```bash
npm run build
```

### Testing
```bash
npm test
```

## Project Structure

```
src/
├── components/         # Reusable UI components
├── pages/              # Page components
├── contexts/           # React context providers
├── hooks/              # Custom hooks
├── api.ts             # API client functions
├── App.tsx            # Main application component
├── index.tsx          # Entry point
└── types.ts           # TypeScript interfaces and types
```

## Development Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm run eject` - Ejects from Create React App (irreversible)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
REACT_APP_API_URL=http://localhost:4000
```

## Deployment

The frontend is deployed to GitHub Pages using the `gh-pages` package:

```bash
npm run deploy
```

This will build the app and deploy it to the `gh-pages` branch.