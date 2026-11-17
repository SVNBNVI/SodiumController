#include "nutrition_calculator.hpp"
#include <string>
#include <nlohmann/json.hpp>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

std::string calculateTraySummaryWasm(const std::string& cartJsonStr, const std::string& benchmarksJsonStr) {
    try {
        nlohmann::json cartJ = nlohmann::json::parse(cartJsonStr);
        std::vector<sodium::TrayItem> items = cartJ.get<std::vector<sodium::TrayItem>>();

        std::vector<sodium::FDABenchmark> benchmarks;
        if (!benchmarksJsonStr.empty()) {
            nlohmann::json bmJ = nlohmann::json::parse(benchmarksJsonStr);
            benchmarks = bmJ.get<std::vector<sodium::FDABenchmark>>();
        } else {
            benchmarks = sodium::NutritionCalculator::getFDABenchmarks();
        }

        sodium::TraySummary summary = sodium::NutritionCalculator::calculateTraySummary(items, benchmarks);
        nlohmann::json summaryJson = summary;
        return summaryJson.dump();
    } catch (const std::exception& e) {
        nlohmann::json err = {
            {"error", true},
            {"message", e.what()}
        };
        return err.dump();
    }
}

EMSCRIPTEN_BINDINGS(nutrition_engine_module) {
    emscripten::function("calculateTraySummary", &calculateTraySummaryWasm);
}
#endif
