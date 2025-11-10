#!/bin/bash
set -e

APP_NAME="CodeMonkey Games"
BUNDLE_DIR="dist/macOS/${APP_NAME}.app"
CONTENTS_DIR="${BUNDLE_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
EXECUTABLE_NAME="codemonkey-games"

# Clean up previous build
echo "Cleaning up previous build..."
rm -rf "dist/macOS"

# Create the directory structure
echo "Creating .app bundle structure..."
mkdir -p "${MACOS_DIR}"
mkdir -p "${RESOURCES_DIR}"

# Copy Info.plist
echo "Copying Info.plist..."
cp "scripts/Info.plist" "${CONTENTS_DIR}/"

# Compile the Deno application
echo "Compiling Deno application..."
deno compile \\
  --allow-read \\
  --allow-write \\
  --allow-env \\
  --allow-net \\
  --allow-run \\
  --output "${MACOS_DIR}/${EXECUTABLE_NAME}" \\
  desktop.ts

# Make the executable runnable
chmod +x "${MACOS_DIR}/${EXECUTABLE_NAME}"

echo "Build complete! The application bundle is at ${BUNDLE_DIR}"
