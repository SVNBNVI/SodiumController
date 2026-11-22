#!/usr/bin/env bash
# WebAssembly build script for SodiumController nutrition calculator
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build-wasm"
DIST_DIR="${SCRIPT_DIR}/../frontend/src/assets/wasm"

echo "=== SodiumController WebAssembly Engine Builder ==="

if ! command -v emcmake &> /dev/null || ! command -v emcc &> /dev/null; then
    echo "[!] Emscripten SDK (emcmake / emcc) was not found in your current PATH."
    echo "    To install and activate Emscripten:"
    echo "      git clone https://github.com/emscripten-core/emsdk.git"
    echo "      cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "      source ./emsdk_env.sh"
    echo "    Then re-run: ./cpp-engine/build-wasm.sh"
    exit 1
fi

echo "[*] Configuring CMake with emcmake..."
emcmake cmake -B "${BUILD_DIR}" -S "${SCRIPT_DIR}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DEMSCRIPTEN=ON

echo "[*] Compiling WebAssembly module..."
cmake --build "${BUILD_DIR}" --target nutrition_engine_wasm

echo "[*] Copying WASM artifacts to Angular assets (${DIST_DIR})..."
mkdir -p "${DIST_DIR}"
cp "${BUILD_DIR}/nutrition_engine.js" "${DIST_DIR}/"
cp "${BUILD_DIR}/nutrition_engine.wasm" "${DIST_DIR}/"
printf '{\n  "available": true\n}\n' > "${DIST_DIR}/wasm-manifest.json"

if [ -d "${SCRIPT_DIR}/../frontend/public" ]; then
    mkdir -p "${SCRIPT_DIR}/../frontend/public/wasm"
    cp "${BUILD_DIR}/nutrition_engine.js" "${SCRIPT_DIR}/../frontend/public/wasm/"
    cp "${BUILD_DIR}/nutrition_engine.wasm" "${SCRIPT_DIR}/../frontend/public/wasm/"
    printf '{\n  "available": true\n}\n' > "${SCRIPT_DIR}/../frontend/public/wasm/wasm-manifest.json"
fi

echo "[✓] WebAssembly engine successfully built and deployed to frontend assets!"
