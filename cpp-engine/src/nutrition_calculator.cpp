#include "nutrition_calculator.hpp"
#include <algorithm>
#include <cmath>

namespace sodium {

const std::vector<FDABenchmark>& NutritionCalculator::getFDABenchmarks() {
    static const std::vector<FDABenchmark> benchmarks = {
        {"sodium_mg", "Sodium", 2300.0, "mg", true},
        {"calories", "Calories", 2000.0, "kcal", false},
        {"satFat_g", "Sat Fat", 20.0, "g", true},
        {"sugar_g", "Sugars", 50.0, "g", true},
        {"fat_g", "Total Fat", 78.0, "g", true},
        {"carbs_g", "Carbs", 275.0, "g", false},
        {"fiber_g", "Fiber", 28.0, "g", false},
        {"protein_g", "Protein", 50.0, "g", false},
        {"cholesterol_mg", "Cholesterol", 300.0, "mg", true}
    };
    return benchmarks;
}

TraySummary NutritionCalculator::calculateTraySummary(const std::vector<TrayItem>& cart) {
    TraySummary summary;
    summary.totalItemsCount = static_cast<int>(cart.size());

    double totalServings = 0.0;
    NutrientTotals& t = summary.totals;

    for (const auto& item : cart) {
        if (item.qty <= 0.0) continue;
        totalServings += item.qty;

        t.calories += item.calories * item.qty;
        t.sodium_mg += item.sodium_mg * item.qty;
        t.satFat_g += item.satFat_g * item.qty;
        t.sugar_g += item.sugar_g * item.qty;
        t.fat_g += item.fat_g * item.qty;
        t.carbs_g += item.carbs_g * item.qty;
        t.fiber_g += item.fiber_g * item.qty;
        t.protein_g += item.protein_g * item.qty;
        t.cholesterol_mg += item.cholesterol_mg * item.qty;
        t.transFat_g += item.transFat_g * item.qty;
    }
    summary.totalServingsCount = totalServings;

    const auto& benchmarks = getFDABenchmarks();
    for (const auto& bm : benchmarks) {
        double val = 0.0;
        if (bm.key == "sodium_mg") val = t.sodium_mg;
        else if (bm.key == "calories") val = t.calories;
        else if (bm.key == "satFat_g") val = t.satFat_g;
        else if (bm.key == "sugar_g") val = t.sugar_g;
        else if (bm.key == "fat_g") val = t.fat_g;
        else if (bm.key == "carbs_g") val = t.carbs_g;
        else if (bm.key == "fiber_g") val = t.fiber_g;
        else if (bm.key == "protein_g") val = t.protein_g;
        else if (bm.key == "cholesterol_mg") val = t.cholesterol_mg;

        double pct = (bm.limit > 0.0) ? (val / bm.limit) * 100.0 : 0.0;

        std::string status = "ok";
        if (bm.isCeiling) {
            if (pct >= 100.0) status = "exceeded";
            else if (pct >= 80.0) status = "warning";
            else status = "ok";
        } else {
            if (pct >= 100.0) status = "achieved";
            else status = "ok";
        }

        PercentDailyValue pdv;
        pdv.key = bm.key;
        pdv.label = bm.label;
        pdv.value = std::round(val * 10.0) / 10.0;
        pdv.limit = bm.limit;
        pdv.unit = bm.unit;
        pdv.percent = std::round(pct * 10.0) / 10.0;
        pdv.isCeiling = bm.isCeiling;
        pdv.status = status;

        summary.percentDV.push_back(pdv);

        // Sodium specific alert
        if (bm.key == "sodium_mg") {
            summary.sodiumPercentDV = pdv.percent;
            summary.sodiumAlertState = status;
        }

        // Rank top offender if ceiling metric is near or over limit
        if (bm.isCeiling && pct >= 80.0 && !cart.empty()) {
            const TrayItem* worstItem = nullptr;
            double maxContribution = -1.0;

            for (const auto& item : cart) {
                double itemVal = 0.0;
                if (bm.key == "sodium_mg") itemVal = item.sodium_mg * item.qty;
                else if (bm.key == "satFat_g") itemVal = item.satFat_g * item.qty;
                else if (bm.key == "sugar_g") itemVal = item.sugar_g * item.qty;
                else if (bm.key == "fat_g") itemVal = item.fat_g * item.qty;
                else if (bm.key == "cholesterol_mg") itemVal = item.cholesterol_mg * item.qty;

                if (itemVal > maxContribution) {
                    maxContribution = itemVal;
                    worstItem = &item;
                }
            }

            if (worstItem && maxContribution > 0.0) {
                TopOffender offender;
                offender.metricKey = bm.key;
                offender.metricLabel = bm.label;
                offender.itemId = worstItem->id;
                offender.itemName = worstItem->name;
                offender.amountContributed = std::round(maxContribution * 10.0) / 10.0;
                offender.percentOfTotal = (val > 0.0) ? std::round((maxContribution / val) * 1000.0) / 10.0 : 0.0;
                offender.percentOfDailyLimit = std::round((maxContribution / bm.limit) * 1000.0) / 10.0;
                summary.topOffenders.push_back(offender);
            }
        }
    }

    if (summary.sodiumAlertState.empty()) {
        summary.sodiumAlertState = "ok";
    }

    return summary;
}

// JSON Serialization
void to_json(nlohmann::json& j, const FDABenchmark& b) {
    j = nlohmann::json{
        {"key", b.key},
        {"label", b.label},
        {"limit", b.limit},
        {"unit", b.unit},
        {"isCeiling", b.isCeiling}
    };
}

void from_json(const nlohmann::json& j, FDABenchmark& b) {
    j.at("key").get_to(b.key);
    j.at("label").get_to(b.label);
    j.at("limit").get_to(b.limit);
    j.at("unit").get_to(b.unit);
    j.at("isCeiling").get_to(b.isCeiling);
}

void to_json(nlohmann::json& j, const NutrientTotals& t) {
    j = nlohmann::json{
        {"calories", t.calories},
        {"sodium_mg", t.sodium_mg},
        {"satFat_g", t.satFat_g},
        {"sugar_g", t.sugar_g},
        {"fat_g", t.fat_g},
        {"carbs_g", t.carbs_g},
        {"fiber_g", t.fiber_g},
        {"protein_g", t.protein_g},
        {"cholesterol_mg", t.cholesterol_mg},
        {"transFat_g", t.transFat_g}
    };
}

void from_json(const nlohmann::json& j, NutrientTotals& t) {
    t.calories = j.value("calories", 0.0);
    t.sodium_mg = j.value("sodium_mg", 0.0);
    t.satFat_g = j.value("satFat_g", 0.0);
    t.sugar_g = j.value("sugar_g", 0.0);
    t.fat_g = j.value("fat_g", 0.0);
    t.carbs_g = j.value("carbs_g", 0.0);
    t.fiber_g = j.value("fiber_g", 0.0);
    t.protein_g = j.value("protein_g", 0.0);
    t.cholesterol_mg = j.value("cholesterol_mg", 0.0);
    t.transFat_g = j.value("transFat_g", 0.0);
}

void to_json(nlohmann::json& j, const PercentDailyValue& p) {
    j = nlohmann::json{
        {"key", p.key},
        {"label", p.label},
        {"value", p.value},
        {"limit", p.limit},
        {"unit", p.unit},
        {"percent", p.percent},
        {"isCeiling", p.isCeiling},
        {"status", p.status}
    };
}

void from_json(const nlohmann::json& j, PercentDailyValue& p) {
    j.at("key").get_to(p.key);
    j.at("label").get_to(p.label);
    p.value = j.value("value", 0.0);
    p.limit = j.value("limit", 0.0);
    p.unit = j.value("unit", "");
    p.percent = j.value("percent", 0.0);
    p.isCeiling = j.value("isCeiling", false);
    p.status = j.value("status", "ok");
}

void to_json(nlohmann::json& j, const TopOffender& o) {
    j = nlohmann::json{
        {"metricKey", o.metricKey},
        {"metricLabel", o.metricLabel},
        {"itemId", o.itemId},
        {"itemName", o.itemName},
        {"amountContributed", o.amountContributed},
        {"percentOfTotal", o.percentOfTotal},
        {"percentOfDailyLimit", o.percentOfDailyLimit}
    };
}

void from_json(const nlohmann::json& j, TopOffender& o) {
    j.at("metricKey").get_to(o.metricKey);
    j.at("metricLabel").get_to(o.metricLabel);
    j.at("itemId").get_to(o.itemId);
    j.at("itemName").get_to(o.itemName);
    o.amountContributed = j.value("amountContributed", 0.0);
    o.percentOfTotal = j.value("percentOfTotal", 0.0);
    o.percentOfDailyLimit = j.value("percentOfDailyLimit", 0.0);
}

void to_json(nlohmann::json& j, const TraySummary& s) {
    j = nlohmann::json{
        {"totalItemsCount", s.totalItemsCount},
        {"totalServingsCount", s.totalServingsCount},
        {"totals", s.totals},
        {"percentDV", s.percentDV},
        {"sodiumAlertState", s.sodiumAlertState},
        {"sodiumPercentDV", s.sodiumPercentDV},
        {"topOffenders", s.topOffenders}
    };
}

void from_json(const nlohmann::json& j, TraySummary& s) {
    s.totalItemsCount = j.value("totalItemsCount", 0);
    s.totalServingsCount = j.value("totalServingsCount", 0.0);
    if (j.contains("totals")) s.totals = j["totals"].get<NutrientTotals>();
    if (j.contains("percentDV")) s.percentDV = j["percentDV"].get<std::vector<PercentDailyValue>>();
    s.sodiumAlertState = j.value("sodiumAlertState", "ok");
    s.sodiumPercentDV = j.value("sodiumPercentDV", 0.0);
    if (j.contains("topOffenders")) s.topOffenders = j["topOffenders"].get<std::vector<TopOffender>>();
}

} // namespace sodium
