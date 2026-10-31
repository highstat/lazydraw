#!/usr/bin/env bash
set -euo pipefail

REPO="highstat/lazydraw"

# Determine OS
OS="$(uname -s)"
case "${OS}" in
  Darwin*)
    OS_NAME="darwin"
    ;;
  Linux*)
    OS_NAME="linux"
    ;;
  *)
    echo "Unsupported operating system: ${OS}. For Windows, please run install.ps1 or download from GitHub Releases." >&2
    exit 1
    ;;
esac

# Determine Architecture
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64)
    ARCH_NAME="x64"
    ;;
  arm64|aarch64)
    ARCH_NAME="arm64"
    ;;
  *)
    echo "Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

BIN_NAME="lazydraw-${OS_NAME}-${ARCH_NAME}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BIN_NAME}"

# Choose installation directory
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "${INSTALL_DIR}"
fi

TARGET="${INSTALL_DIR}/lazydraw"

echo "Downloading lazydraw (${OS_NAME}/${ARCH_NAME}) from GitHub Releases..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "${DOWNLOAD_URL}" -o "${TARGET}.tmp"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "${TARGET}.tmp" "${DOWNLOAD_URL}"
else
  echo "Error: curl or wget is required to install lazydraw." >&2
  exit 1
fi

mv "${TARGET}.tmp" "${TARGET}"
chmod +x "${TARGET}"

echo "Successfully installed lazydraw to ${TARGET}"

# Check if INSTALL_DIR is on PATH
case ":${PATH}:" in
  *:"${INSTALL_DIR}":*) ;;
  *)
    echo ""
    echo "Notice: ${INSTALL_DIR} is not currently in your PATH."
    echo "Add the following line to your shell profile (~/.zshrc or ~/.bashrc):"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    ;;
esac

echo "Run 'lazydraw' to start!"
