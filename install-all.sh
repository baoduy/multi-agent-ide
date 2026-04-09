#!/bin/bash

# Install dependencies for all packages in the monorepo

set -e  # Exit on error

echo "🚀 Installing dependencies for multi-agent-ide monorepo..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Install root dependencies
echo -e "${BLUE}📦 Installing root dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Root dependencies installed${NC}"
echo ""

# Install shared package
echo -e "${BLUE}📦 Installing @magenta/shared dependencies...${NC}"
pnpm -C packages/shared install
echo -e "${GREEN}✓ @magenta/shared dependencies installed${NC}"
echo ""

# Install daemon package
echo -e "${BLUE}📦 Installing @magenta/daemon dependencies...${NC}"
pnpm -C packages/daemon install
echo -e "${GREEN}✓ @magenta/daemon dependencies installed${NC}"
echo ""

# Install main package
echo -e "${BLUE}📦 Installing @magenta/main dependencies...${NC}"
pnpm -C packages/main install
echo -e "${GREEN}✓ @magenta/main dependencies installed${NC}"
echo ""

# Install ui package
echo -e "${BLUE}📦 Installing @magenta/ui dependencies...${NC}"
pnpm -C packages/ui install
echo -e "${GREEN}✓ @magenta/ui dependencies installed${NC}"
echo ""

echo -e "${GREEN}✅ All dependencies installed successfully!${NC}"
echo ""
echo "You can now run:"
echo "  pnpm dev       - Build all packages and start the Electron app"
echo "  pnpm build     - Build all packages"
echo "  pnpm typecheck - Type check all packages"
