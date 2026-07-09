#!/usr/bin/env bash
# Build the Swift package and wrap it into a runnable Pace.app bundle
# (with calendar usage descriptions + ad-hoc code signing so macOS TCC grants access).
set -euo pipefail
cd "$(dirname "$0")/.."

APP="Pace.app"
BIN_NAME="PaceApp"

echo "▶︎ swift build -c release"
swift build -c release

BIN_PATH="$(swift build -c release --show-bin-path)/${BIN_NAME}"
if [[ ! -f "$BIN_PATH" ]]; then
  echo "✗ Built binary not found at $BIN_PATH" >&2
  exit 1
fi

echo "▶︎ assembling ${APP}"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_PATH" "$APP/Contents/MacOS/${BIN_NAME}"
cp Resources/Info.plist "$APP/Contents/Info.plist"

echo "▶︎ ad-hoc code signing"
codesign --force --deep --sign - "$APP"

echo ""
echo "✅ Built ./${APP}"
echo "   Start:  open ./${APP}"
echo "   (Pace erscheint als Symbol in der Menüleiste. Beim ersten 'Kalender verbinden'"
echo "    fragt macOS nach Kalender-Zugriff — bitte 'Erlauben'.)"
