# Contributing to Ditto

Thank you for your interest in contributing to Ditto! We welcome contributions from developers and AI pair programmers alike.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please be respectful, constructive, and considerate in all interactions.

## Development Workflow

Ditto uses a trunk-based development workflow with short-lived feature branches and atomic commits.

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Java Development Kit (JDK)**: 17+ (for running Android Gradle builds)

### Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/ditto.git
   cd ditto
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the test suite:
   ```bash
   npm test
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Commit Conventions

We strictly enforce **Conventional Commits**:
- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation-only changes
- `test:` Adding or updating tests
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `perf:` A code change that improves performance
- `chore:` Changes to build process, tooling, or dependencies

Example:
```bash
git commit -m "feat(android): add dynamic APK output discovery"
```

## Definition of Done for Pull Requests

Before submitting a pull request, ensure:
1. All unit and integration tests pass: `npm test`
2. Code builds cleanly without warnings or TypeScript errors: `npm run build`
3. Any new public interfaces or commands are documented in `README.md`
4. Changes are reflected in the `[Unreleased]` section of `CHANGELOG.md`
5. New features or bug fixes include accompanying tests
