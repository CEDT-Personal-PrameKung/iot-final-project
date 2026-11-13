# AGENTS.md

## Project Overview

This project uses a monorepo structure with separate frontend and backend applications.

- **Frontend:** Next.js (App Router) with TypeScript.
- **Backend:** Undecided. Keep the architecture framework-agnostic until a backend technology is selected.
- **Architecture:** Feature-based, modular, and maintainable.

## Project Structure

```text
project-root/
├── frontend/              # Next.js application
├── backend/               # Backend application
├── docs/                  # Project documentation
│   ├── architecture/
│   └── api/
├── infrastructure/        # Deployment and infrastructure
│   ├── docker/
│   └── deployment/
├── .env.example
├── docker-compose.yml
├── AGENTS.md
└── README.md
```

## General Development Guidelines

### 1. Code Quality

- Write clean, readable, and maintainable code.
- Follow the conventions and coding standards of the selected language and framework.
- Prefer simple solutions over unnecessary abstractions.
- Avoid duplicated logic; extract reusable code when appropriate.
- Use meaningful names for variables, functions, components, and files.
- Keep functions and components focused on a single responsibility.
- Do not introduce dependencies unless they provide clear value.

### 2. Architecture

- Keep frontend and backend responsibilities separate.
- Organize code by features or business domains.
- Avoid unnecessary coupling between modules.
- Keep business logic separate from presentation and infrastructure concerns.
- Design clear interfaces between modules.
- Do not prematurely introduce shared packages or complex abstractions.

### 3. Type Safety

- Use TypeScript for frontend development.
- Avoid `any` unless absolutely necessary.
- Define explicit types for API requests and responses.
- Validate external input at application boundaries.
- Handle nullable and optional values explicitly.

### 4. Error Handling

- Handle errors explicitly.
- Never silently ignore unexpected errors.
- Provide meaningful error messages.
- Avoid exposing internal implementation details or sensitive information to clients.

### 5. Security

- Never commit secrets, API keys, credentials, or private environment variables.
- Validate and sanitize user input.
- Enforce authorization on the backend.
- Never trust frontend validation as a security boundary.
- Use environment variables for configuration.
- Follow secure authentication and session management practices.

## Frontend Guidelines

### Technology

- Next.js with App Router.
- TypeScript.
- Tailwind CSS.
- ESLint.

### Directory Responsibilities

```text
frontend/src/
├── app/                   # Routes and layouts
├── components/
│   ├── ui/                # Reusable UI primitives
│   └── shared/            # Shared application components
├── features/              # Feature-specific implementation
├── hooks/                 # Custom React hooks
├── lib/
│   ├── api/               # API clients
│   ├── utils/             # Utility functions
│   └── validations/       # Input validation schemas
├── types/                 # Shared TypeScript types
└── styles/                # Global styles
```

### Frontend Rules

- Use Server Components by default.
- Use Client Components only when interactivity or browser APIs are required.
- Keep page components focused on composition and routing.
- Put feature-specific components and logic inside their respective `features/` directories.
- Use reusable components for genuinely shared UI.
- Keep API communication inside `lib/api/` or feature-specific API modules.
- Avoid unnecessary client-side state management.
- Use semantic HTML and accessible UI patterns.
- Follow responsive design principles.
- Avoid duplicating styles and UI logic.

## Backend Guidelines

The backend framework has not been selected yet.

Until then:

- Keep the backend structure modular.
- Organize implementation around business domains.
- Separate HTTP handling, business logic, and data access.
- Keep database access isolated from business logic.
- Validate incoming requests.
- Use consistent API response and error formats.
- Write tests for business-critical logic.

Do not assume a specific programming language, framework, database, or ORM before the project makes that decision.

## API Guidelines

- Use RESTful conventions unless the project establishes another API style.
- Use appropriate HTTP methods and status codes.
- Keep request and response structures consistent.
- Version APIs when necessary.
- Document endpoints, parameters, authentication, and response schemas.
- Do not expose database models directly as API contracts.

## Environment Configuration

- Keep frontend and backend environment variables separate.
- Maintain `.env.example` files documenting required variables.
- Never commit actual `.env` files.
- Do not hardcode environment-specific URLs or credentials.

## Testing Guidelines

- Write tests for important business logic.
- Test edge cases and failure scenarios.
- Ensure existing tests pass before completing changes.
- Do not remove or weaken tests simply to make a build pass.
- Add regression tests when fixing bugs.

## Git Guidelines

Use Conventional Commits:

- `feat`: New features.
- `fix`: Bug fixes.
- `refactor`: Code restructuring without behavior changes.
- `docs`: Documentation changes.
- `test`: Test-related changes.
- `chore`: Maintenance tasks.
- `style`: Formatting and styling changes.

Examples:

```text
feat(auth): add login functionality
fix(api): handle invalid request payloads
refactor(frontend): simplify dashboard components
docs: update project setup instructions
```

## Instructions for Coding Agents

Before making changes:

1. Inspect the existing project structure.
2. Read relevant documentation and existing implementation.
3. Understand the affected modules and their dependencies.
4. Follow existing conventions unless there is a clear reason to improve them.

While implementing:

1. Make focused, incremental changes.
2. Avoid modifying unrelated files.
3. Do not overwrite existing implementations without understanding them.
4. Do not introduce unnecessary dependencies.
5. Keep documentation updated when architecture or behavior changes.

After implementing:

1. Run relevant linting and formatting checks.
2. Run relevant tests.
3. Run type checking and production builds when applicable.
4. Fix issues introduced by your changes.
5. Summarize what changed and mention any remaining limitations.

**Important:** Do not assume requirements, technologies, or architectural decisions that have not been established. Ask for clarification when an important decision cannot be safely inferred.
