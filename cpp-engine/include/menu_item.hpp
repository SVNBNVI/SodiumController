#pragma once

#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace sodium {

struct MenuItem {
    std::string id;
    std::string name;
    std::string mealPeriod; // "breakfast", "lunch", "dinner"
    std::string station;
    std::string servingSize;
    double calories = 0.0;
    double protein_g = 0.0;
    double carbs_g = 0.0;
    double fat_g = 0.0;
    double satFat_g = 0.0;
    double transFat_g = 0.0;
    double cholesterol_mg = 0.0;
    double sodium_mg = 0.0;
    double sugar_g = 0.0;
    double fiber_g = 0.0;
    std::vector<std::string> tags;
    std::vector<std::string> allergens;

    bool operator==(const MenuItem& other) const = default;
};

struct TrayItem : public MenuItem {
    double qty = 1.0;

    TrayItem() = default;
    explicit TrayItem(const MenuItem& item, double quantity = 1.0)
        : MenuItem(item), qty(quantity) {}
};

struct DailyMenuPayload {
    std::string project = "SodiumController";
    std::string date;
    std::string lastUpdated;
    std::string hall = "Bursley Dining Hall";
    std::string hallSlug = "bursley";
    std::string sourceUrl;
    bool isFallback = false;
    int itemCount = 0;
    std::vector<MenuItem> items;
};

// JSON Serialization
inline void to_json(nlohmann::json& j, const MenuItem& item) {
    j = nlohmann::json{
        {"id", item.id},
        {"name", item.name},
        {"mealPeriod", item.mealPeriod},
        {"station", item.station},
        {"servingSize", item.servingSize},
        {"calories", item.calories},
        {"protein_g", item.protein_g},
        {"carbs_g", item.carbs_g},
        {"fat_g", item.fat_g},
        {"satFat_g", item.satFat_g},
        {"transFat_g", item.transFat_g},
        {"cholesterol_mg", item.cholesterol_mg},
        {"sodium_mg", item.sodium_mg},
        {"sugar_g", item.sugar_g},
        {"fiber_g", item.fiber_g},
        {"tags", item.tags},
        {"allergens", item.allergens}
    };
}

inline void from_json(const nlohmann::json& j, MenuItem& item) {
    j.at("id").get_to(item.id);
    j.at("name").get_to(item.name);
    item.mealPeriod = j.value("mealPeriod", "lunch");
    item.station = j.value("station", "General");
    item.servingSize = j.value("servingSize", "1 serving");
    item.calories = j.value("calories", 0.0);
    item.protein_g = j.value("protein_g", 0.0);
    item.carbs_g = j.value("carbs_g", 0.0);
    item.fat_g = j.value("fat_g", 0.0);
    item.satFat_g = j.value("satFat_g", 0.0);
    item.transFat_g = j.value("transFat_g", 0.0);
    item.cholesterol_mg = j.value("cholesterol_mg", 0.0);
    item.sodium_mg = j.value("sodium_mg", 0.0);
    item.sugar_g = j.value("sugar_g", 0.0);
    item.fiber_g = j.value("fiber_g", 0.0);
    if (j.contains("tags") && j["tags"].is_array()) {
        item.tags = j["tags"].get<std::vector<std::string>>();
    } else {
        item.tags.clear();
    }
    if (j.contains("allergens") && j["allergens"].is_array()) {
        item.allergens = j["allergens"].get<std::vector<std::string>>();
    } else {
        item.allergens.clear();
    }
}

inline void to_json(nlohmann::json& j, const TrayItem& item) {
    to_json(j, static_cast<const MenuItem&>(item));
    j["qty"] = item.qty;
}

inline void from_json(const nlohmann::json& j, TrayItem& item) {
    from_json(j, static_cast<MenuItem&>(item));
    item.qty = j.value("qty", 1.0);
}

inline void to_json(nlohmann::json& j, const DailyMenuPayload& payload) {
    j = nlohmann::json{
        {"project", payload.project},
        {"date", payload.date},
        {"lastUpdated", payload.lastUpdated},
        {"hall", payload.hall},
        {"hallSlug", payload.hallSlug},
        {"sourceUrl", payload.sourceUrl},
        {"isFallback", payload.isFallback},
        {"itemCount", payload.itemCount},
        {"items", payload.items}
    };
}

inline void from_json(const nlohmann::json& j, DailyMenuPayload& payload) {
    payload.project = j.value("project", "SodiumController");
    payload.date = j.value("date", "");
    payload.lastUpdated = j.value("lastUpdated", "");
    payload.hall = j.value("hall", "Bursley Dining Hall");
    payload.hallSlug = j.value("hallSlug", "bursley");
    payload.sourceUrl = j.value("sourceUrl", "");
    payload.isFallback = j.value("isFallback", false);
    payload.itemCount = j.value("itemCount", 0);
    if (j.contains("items") && j["items"].is_array()) {
        payload.items = j["items"].get<std::vector<MenuItem>>();
    } else {
        payload.items.clear();
    }
}

} // namespace sodium
