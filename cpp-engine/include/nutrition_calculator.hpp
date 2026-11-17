#pragma once

#include "menu_item.hpp"
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace sodium {

struct FDABenchmark {
    std::string key;
    std::string label;
    double limit = 0.0;
    std::string unit;
    bool isCeiling = false; // true for sodium, satFat, sugar, fat, cholesterol; false for fiber/protein (floor) or calories/carbs (target)
};

struct NutrientTotals {
    double calories = 0.0;
    double sodium_mg = 0.0;
    double satFat_g = 0.0;
    double sugar_g = 0.0;
    double fat_g = 0.0;
    double carbs_g = 0.0;
    double fiber_g = 0.0;
    double protein_g = 0.0;
    double cholesterol_mg = 0.0;
    double transFat_g = 0.0;
};

struct PercentDailyValue {
    std::string key;
    std::string label;
    double value = 0.0;
    double limit = 0.0;
    std::string unit;
    double percent = 0.0; // e.g. 85.0 for 85%
    bool isCeiling = false;
    std::string status; // "ok", "warning", "exceeded", "achieved"
};

struct TopOffender {
    std::string metricKey;
    std::string metricLabel;
    std::string itemId;
    std::string itemName;
    double amountContributed = 0.0;
    double percentOfTotal = 0.0;
    double percentOfDailyLimit = 0.0;
};

struct TraySummary {
    int totalItemsCount = 0;
    double totalServingsCount = 0.0;
    NutrientTotals totals;
    std::vector<PercentDailyValue> percentDV;
    std::string sodiumAlertState; // "ok", "warning", "exceeded"
    double sodiumPercentDV = 0.0;
    std::vector<TopOffender> topOffenders; // Ranked offending items when ceiling metrics are exceeded or warned
};

// JSON Serialization
void to_json(nlohmann::json& j, const FDABenchmark& b);
void from_json(const nlohmann::json& j, FDABenchmark& b);

void to_json(nlohmann::json& j, const NutrientTotals& t);
void from_json(const nlohmann::json& j, NutrientTotals& t);

void to_json(nlohmann::json& j, const PercentDailyValue& p);
void from_json(const nlohmann::json& j, PercentDailyValue& p);

void to_json(nlohmann::json& j, const TopOffender& o);
void from_json(const nlohmann::json& j, TopOffender& o);

void to_json(nlohmann::json& j, const TraySummary& s);
void from_json(const nlohmann::json& j, TraySummary& s);

class NutritionCalculator {
public:
    static const std::vector<FDABenchmark>& getFDABenchmarks();
    static TraySummary calculateTraySummary(const std::vector<TrayItem>& cart,
                                            const std::vector<FDABenchmark>& benchmarks = getFDABenchmarks());
};

} // namespace sodium
