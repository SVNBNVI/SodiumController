cmake_minimum_required(VERSION 3.20)
project(SodiumControllerEngine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler optimization & warnings
if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -O2)
endif()

# Find or Fetch nlohmann/json
find_package(nlohmann_json 3.10.0 QUIET)
if(NOT nlohmann_json_FOUND)
    message(STATUS "nlohmann_json not found locally; fetching via FetchContent...")
    include(FetchContent)
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(nlohmann_json)
else()
    message(STATUS "Found local nlohmann_json version: ${nlohmann_json_VERSION}")
endif()

# Core Nutrition & Parser Engine Library (Decoupled from network/curl)
add_library(nutrition_engine
    src/html_parser.cpp
    src/nutrition_calculator.cpp
)

target_include_directories(nutrition_engine PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

target_link_libraries(nutrition_engine PUBLIC
    nlohmann_json::nlohmann_json
)

# ── WebAssembly Build (Emscripten) ──
if(EMSCRIPTEN)
    message(STATUS "Configuring WebAssembly target (nutrition_engine_wasm)...")
    add_executable(nutrition_engine_wasm
        src/nutrition_calculator.cpp
        wasm/nutrition_bindings.cpp
    )

    target_include_directories(nutrition_engine_wasm PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    )

    target_link_libraries(nutrition_engine_wasm PRIVATE
        nlohmann_json::nlohmann_json
    )

    set_target_properties(nutrition_engine_wasm PROPERTIES
        OUTPUT_NAME "nutrition_engine"
        SUFFIX ".js"
    )

    target_compile_options(nutrition_engine_wasm PRIVATE -O3 -std=c++20)
    target_link_options(nutrition_engine_wasm PRIVATE
        -O3
        --bind
        -s MODULARIZE=1
        -s EXPORT_ES6=1
        -s EXPORT_NAME="createNutritionEngine"
        -s ALLOW_MEMORY_GROWTH=1
        -s ENVIRONMENT=web,worker
    )
else()
    # ── Native Scraper & Tests ──
    find_package(CURL REQUIRED)

    # Sodium Scraper Executable
    add_executable(sodium_scraper
        src/main_scraper.cpp
    )

    target_link_libraries(sodium_scraper PRIVATE
        nutrition_engine
        CURL::libcurl
    )

    # Test Suite Executable
    enable_testing()
    add_executable(test_nutrition_engine
        tests/test_nutrition_engine.cpp
    )

    target_link_libraries(test_nutrition_engine PRIVATE
        nutrition_engine
    )

    add_test(NAME EngineTests COMMAND test_nutrition_engine)
endif()
