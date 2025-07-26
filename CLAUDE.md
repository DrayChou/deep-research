# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- Start development server: `pnpm dev` (runs on port 3001, binds to 0.0.0.0)
- Build for production: `pnpm build`
- Start production server: `pnpm start` (runs on port 3001, binds to 0.0.0.0)
- Lint code: `pnpm lint` or `next lint`
- Install dependencies: `pnpm install` (preferred) or `npm install`

### Build Variations
- Static export: `pnpm build:export` (for static deployment)
- Standalone build: Set `NEXT_PUBLIC_BUILD_MODE=standalone` then `pnpm build`

### Docker
- Build image: `docker build -t deep-research .`
- Run container: `docker run -d --name deep-research -p 3000:3000 deep-research`
- Docker compose: `docker compose up -d`

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript with strict mode enabled
- **UI**: React 19 with Shadcn/ui components and Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **State Management**: Zustand for global state
- **Authentication**: JWT-based with optional data center integration
- **AI Integration**: Multiple AI providers (Google Gemini, OpenAI, Anthropic, etc.)
- **Search**: Multiple search providers (Tavily, Firecrawl, Exa, etc.)
- **PWA**: Service Worker with Serwist for offline capabilities
- **Deployment**: Supports Vercel, Cloudflare Pages, Docker, and static export

### Project Structure
- **`src/app/`**: Next.js App Router with API routes and main application
  - **`api/`**: Server-side API endpoints for AI providers, search, MCP, and SSE
  - **`globals.css`**: Global styles and CSS variables
  - **`layout.tsx`**: Root layout with providers
- **`src/components/`**: React components organized by feature
  - **`ui/`**: Shadcn/ui base components
  - **`Internal/`**: Core application components
  - **`Research/`**: Research-specific components
  - **`Knowledge/`**: Knowledge base components
- **`src/hooks/`**: Custom React hooks for various functionalities
- **`src/store/`**: Zustand stores for state management
- **`src/utils/`**: Utility functions and helpers
- **`src/types.d.ts`**: Global type definitions
- **`src/constants/`**: Application constants and configurations

### Key Features
- **Deep Research**: AI-powered research with multiple thinking/task models
- **Multi-LLM Support**: Google Gemini, OpenAI, Anthropic, DeepSeek, XAI, Mistral, Azure, OpenRouter, Ollama
- **Web Search Integration**: Tavily, Firecrawl, Exa, Bocha, SearXNG
- **Knowledge Base**: File upload and processing (PDF, Office, text)
- **Research History**: Persistent storage using LocalForage
- **Artifact Editing**: WYSIWYG and Markdown editors
- **Knowledge Graphs**: Visual representation of research findings
- **SSE API**: Server-Sent Events for real-time research streaming
- **MCP Server**: Model Context Protocol for AI service integration
- **Internationalization**: Multi-language support (en-US, zh-CN, es-ES)

### Configuration
- **Environment Variables**: Defined in `env.tpl`, supports multiple API keys per provider
- **Next.js Config**: Dynamic configuration with proxy rewrites for API providers
- **Build Modes**: Standard, export (static), standalone (Docker)
- **Security**: CSP headers, access password protection
- **Customization**: Model list customization, theme system

### API Architecture
- **Proxy Mode**: API calls routed through Next.js rewrites to avoid CORS
- **Direct Mode**: Client-side API calls for local deployment scenarios
- **Server API**: Protected server-side endpoints with optional password authentication
- **Streaming**: Real-time responses via Server-Sent Events
- **MCP Integration**: Both StreamableHTTP and SSE transport types

### Development Notes
- Uses React Compiler experimental features
- TypeScript strict mode with path aliases (`@/*`)
- ESLint with Next.js and TypeScript rules
- Tailwind with custom design tokens and animations
- Service Worker for PWA capabilities with Serwist
- File parsing utilities for various document formats
- JWT authentication with data center integration
- Local storage management with encryption support

### Deployment Considerations
- **Vercel**: One-click deployment with environment variables
- **Cloudflare Pages**: Static export with edge functions
- **Docker**: Multi-stage build with Alpine Linux, non-root user
- **Static**: Export mode for any static hosting provider
- **Base Path**: Configurable via `NEXT_PUBLIC_BASE_PATH` (default: `/dp2api`)

### Testing and Quality
- ESLint for code quality
- TypeScript for type safety
- Next.js built-in optimizations
- Performance monitoring capabilities
- Error boundary implementations

## Development Guidelines

### Testing Requirements
- **Real Data Testing**: Always use real scenarios and actual data for testing
- **No Mock Data**: Avoid using mock or simulated data for validation
- **Iterative Development**: Each modification should be thoroughly tested with real use cases
- **Production-like Environment**: Test in environments that closely mirror production conditions

### Code Quality Standards
- Test all functionality with actual API calls and real data sources
- Validate integrations with live AI providers and search engines
- Ensure proper error handling with real failure scenarios
- Verify performance with realistic data volumes and network conditions