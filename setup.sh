#!/bin/bash

# CorpusFlow Setup Script
# Installs dependencies and configures environment for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running from project root
if [ ! -f "package.json" ] || [ ! -f "algorithm/pyproject.toml" ]; then
    print_error "Please run this script from the CorpusFlow project root directory"
    exit 1
fi

print_header "CorpusFlow Development Setup"
echo ""

# 1. Check Node.js
print_header "Checking Node.js"
if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    echo "Please install Node.js 20+ from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    print_error "Node.js version must be 20 or higher (found: $(node -v))"
    exit 1
fi
print_success "Node.js $(node -v) found"

# 2. Check Python
print_header "Checking Python"
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 not found"
    echo "Please install Python 3.11+ from: https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(python3 -c 'import sys; print(sys.version_info.major)')
PYTHON_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]); then
    print_error "Python version must be 3.11 or higher (found: $PYTHON_VERSION)"
    exit 1
fi
print_success "Python $PYTHON_VERSION found"

# 3. Check uv
print_header "Checking uv"
if ! command -v uv &> /dev/null; then
    print_warning "uv not found, installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    if ! command -v uv &> /dev/null; then
        print_error "Failed to install uv"
        echo "Please manually install from: https://github.com/astral-sh/uv"
        exit 1
    fi
fi
print_success "uv $(uv --version) found"

# 4. Setup environment variables
print_header "Setting up environment"

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    print_warning ".env.local not found, creating from .env.example..."
    cp .env.example .env.local
    print_success "Created .env.local from .env.example"

    # Prompt for ARK_API_KEY
    echo ""
    echo "CorpusFlow uses Doubao (ByteDance) LLM for corpus generation."
    echo "You need an API key from: https://console.volcengine.com/iam/keymanage"
    echo ""
    read -p "Enter your ARK_API_KEY (press Enter to skip, edit .env.local later): " ark_key

    if [ ! -z "$ark_key" ]; then
        # Use sed to replace ARK_API_KEY value (handle macOS BSD sed)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^ARK_API_KEY=.*/ARK_API_KEY=$ark_key/" .env.local
        else
            sed -i "s/^ARK_API_KEY=.*/ARK_API_KEY=$ark_key/" .env.local
        fi
        print_success "ARK_API_KEY configured in .env.local"
    else
        print_warning "Skipped API key setup. You can edit .env.local manually later."
    fi
else
    print_success ".env.local already exists, skipping interactive setup"
fi

echo ""

# 5. Install Node dependencies
print_header "Installing Node.js dependencies"
npm install
print_success "Node dependencies installed"

# 6. Install Python dependencies (via uv)
print_header "Setting up Python environment"
cd algorithm
uv sync
cd ..
print_success "Python dependencies synced"

# 7. Summary
echo ""
print_header "Setup Complete!"
echo ""
echo "Next steps:"
echo ""
echo "  1. Start the development stack:"
echo "     ${BLUE}npm run dev:all${NC}"
echo ""
echo "  2. Open in browser:"
echo "     ${BLUE}http://localhost:3000${NC}"
echo ""
echo "Services:"
echo "  - Frontend & API backend: http://127.0.0.1:3000"
echo "  - Algorithm service:      http://127.0.0.1:8001"
echo ""
if [ -z "$ark_key" ]; then
    echo "⚠ Note: Edit .env.local to add your ARK_API_KEY before running generation features"
fi
echo ""
