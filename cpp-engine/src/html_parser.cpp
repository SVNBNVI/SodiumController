#include "html_parser.hpp"
#include <regex>
#include <algorithm>
#include <cctype>
#include <iostream>

namespace sodium {

std::string HtmlParser::stripHtml(std::string_view html) {
    std::string result;
    result.reserve(html.size());
    bool inTag = false;
    for (char c : html) {
        if (c == '<') {
            inTag = true;
        } else if (c == '>') {
            inTag = false;
        } else if (!inTag) {
            result.push_back(c);
        }
    }
    return unescapeHtml(result);
}

std::string HtmlParser::unescapeHtml(std::string_view input) {
    std::string s(input);
    auto replaceAll = [](std::string& str, const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = str.find(from, pos)) != std::string::npos) {
            str.replace(pos, from.length(), to);
            pos += to.length();
        }
    };

    replaceAll(s, "&nbsp;", " ");
    replaceAll(s, "&amp;", "&");
    replaceAll(s, "&#039;", "'");
    replaceAll(s, "&apos;", "'");
    replaceAll(s, "&quot;", "\"");
    replaceAll(s, "&lt;", "<");
    replaceAll(s, "&gt;", ">");

    // Collapse multiple whitespace
    std::string clean;
    clean.reserve(s.size());
    bool inSpace = false;
    for (char c : s) {
        if (std::isspace(static_cast<unsigned char>(c))) {
            if (!inSpace) {
                clean.push_back(' ');
                inSpace = true;
            }
        } else {
            clean.push_back(c);
            inSpace = false;
        }
    }
    while (!clean.empty() && clean.front() == ' ') clean.erase(clean.begin());
    while (!clean.empty() && clean.back() == ' ') clean.pop_back();
    return clean;
}

double HtmlParser::extractNumber(const std::string& text, const std::string& pattern) {
    try {
        std::regex re(pattern, std::regex_constants::icase);
        std::smatch m;
        if (std::regex_search(text, m, re) && m.size() > 1) {
            return std::stod(m[1].str());
        }
    } catch (...) {
        return 0.0;
    }
    return 0.0;
}

std::vector<MenuItem> HtmlParser::parseBursleyHtml(const std::string& html) {
    return parseDiningHallHtml(html, "bursley");
}

std::vector<MenuItem> HtmlParser::parseDiningHallHtml(const std::string& html, const std::string& hallSlug) {
    std::vector<MenuItem> items;
    int idCounter = 1;

    struct MealSpan {
        std::string name;
        size_t startPos;
        size_t endPos;
    };

    std::vector<MealSpan> meals;
    size_t searchPos = 0;

    // Scan for meal headers in <h3>...</h3>
    while (true) {
        size_t h3Start = html.find("<h3", searchPos);
        if (h3Start == std::string::npos) break;
        size_t h3End = html.find("</h3>", h3Start);
        if (h3End == std::string::npos) break;

        std::string h3Content = html.substr(h3Start, h3End - h3Start + 5);
        std::string lowerH3 = h3Content;
        std::transform(lowerH3.begin(), lowerH3.end(), lowerH3.begin(), ::tolower);

        std::string mealPeriod;
        if (lowerH3.find("breakfast") != std::string::npos) mealPeriod = "breakfast";
        else if (lowerH3.find("lunch") != std::string::npos) mealPeriod = "lunch";
        else if (lowerH3.find("brunch") != std::string::npos) mealPeriod = "lunch";
        else if (lowerH3.find("dinner") != std::string::npos) mealPeriod = "dinner";

        if (!mealPeriod.empty()) {
            if (!meals.empty()) {
                meals.back().endPos = h3Start;
            }
            meals.push_back({mealPeriod, h3End + 5, html.size()});
        }
        searchPos = h3End + 5;
    }

    size_t mdiningHours = html.find("id=\"mdining-hours\"");
    if (mdiningHours != std::string::npos && !meals.empty()) {
        meals.back().endPos = std::min(meals.back().endPos, mdiningHours);
    }

    for (const auto& meal : meals) {
        if (meal.endPos <= meal.startPos) continue;
        std::string mealBody = html.substr(meal.startPos, meal.endPos - meal.startPos);

        size_t stPos = 0;
        while (true) {
            size_t h4Start = mealBody.find("<h4", stPos);
            if (h4Start == std::string::npos) break;
            size_t h4Close = mealBody.find(">", h4Start);
            if (h4Close == std::string::npos) break;
            size_t h4End = mealBody.find("</h4>", h4Close);
            if (h4End == std::string::npos) break;

            std::string stationName = stripHtml(mealBody.substr(h4Close + 1, h4End - h4Close - 1));
            size_t nextH4 = mealBody.find("<h4", h4End);
            size_t stEnd = (nextH4 != std::string::npos) ? nextH4 : mealBody.size();
            std::string stationBody = mealBody.substr(h4End + 5, stEnd - h4End - 5);

            // Find each dish in this station
            size_t itPos = 0;
            while (true) {
                size_t spanStart = stationBody.find("class=\"item-name\"", itPos);
                if (spanStart == std::string::npos) {
                    spanStart = stationBody.find("class='item-name'", itPos);
                }
                if (spanStart == std::string::npos) break;

                size_t nameTagClose = stationBody.find(">", spanStart);
                if (nameTagClose == std::string::npos) break;
                size_t nameEnd = stationBody.find("</", nameTagClose);
                if (nameEnd == std::string::npos) break;

                std::string dishName = stripHtml(stationBody.substr(nameTagClose + 1, nameEnd - nameTagClose - 1));

                size_t nextItem = stationBody.find("class=\"item-name\"", nameEnd);
                if (nextItem == std::string::npos) nextItem = stationBody.find("class='item-name'", nameEnd);
                size_t itemBlockEnd = (nextItem != std::string::npos) ? nextItem : stationBody.size();

                std::string itemBlock = stationBody.substr(nameEnd, itemBlockEnd - nameEnd);

                if (!dishName.empty() && (itemBlock.find("Nutrition Facts") != std::string::npos || 
                                           itemBlock.find("nutrition-facts") != std::string::npos || 
                                           itemBlock.find("Calories") != std::string::npos)) {
                    MenuItem item;
                    item.id = "sc-" + hallSlug + "-" + meal.name + "-" + std::to_string(idCounter++);
                    item.name = dishName;
                    item.mealPeriod = meal.name;
                    item.station = stationName;

                    // Extract serving size
                    std::regex servingRe(R"(Serving Size\s*(?:</strong>)?\s*([^<\r\n]+))", std::regex_constants::icase);
                    std::smatch servingMatch;
                    if (std::regex_search(itemBlock, servingMatch, servingRe) && servingMatch.size() > 1) {
                        std::string rawServing = stripHtml(servingMatch[1].str());
                        // Trim trailing "Amount Per Serving" or "Calories" if present
                        size_t cutAmt = rawServing.find("Amount Per Serving");
                        if (cutAmt != std::string::npos) rawServing = rawServing.substr(0, cutAmt);
                        size_t cutCal = rawServing.find("Calories");
                        if (cutCal != std::string::npos) rawServing = rawServing.substr(0, cutCal);
                        item.servingSize = unescapeHtml(rawServing);
                    } else {
                        item.servingSize = "1 serving";
                    }

                    // Extract numeric nutrition values
                    std::string plainText = stripHtml(itemBlock);
                    item.calories = extractNumber(plainText, R"(Calories\s+([0-9]+(?:\.[0-9]+)?))");
                    item.fat_g = extractNumber(plainText, R"(Total Fat\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.satFat_g = extractNumber(plainText, R"(Saturated Fat\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.transFat_g = extractNumber(plainText, R"(Trans Fat\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.cholesterol_mg = extractNumber(plainText, R"(Cholesterol\s+([0-9]+(?:\.[0-9]+)?)\s*mg)");
                    item.sodium_mg = extractNumber(plainText, R"(Sodium\s+([0-9]+(?:\.[0-9]+)?)\s*mg)");
                    item.carbs_g = extractNumber(plainText, R"(Total Carbohydrate\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.fiber_g = extractNumber(plainText, R"(Dietary Fiber\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.sugar_g = extractNumber(plainText, R"(Sugars\s+([0-9]+(?:\.[0-9]+)?)\s*g)");
                    item.protein_g = extractNumber(plainText, R"(Protein\s+([0-9]+(?:\.[0-9]+)?)\s*g)");

                    // Tags / traits: search both pre-tag (e.g. <li class="trait-vegan">) and item body
                    size_t tagSearchStart = 0;
                    size_t liStart = stationBody.rfind("<li", spanStart);
                    if (liStart != std::string::npos && (itPos == 0 || liStart >= itPos)) {
                        tagSearchStart = liStart;
                    } else {
                        tagSearchStart = spanStart;
                    }
                    std::string tagScope = stationBody.substr(tagSearchStart, itemBlockEnd - tagSearchStart);
                    std::string lowerTagScope = tagScope;
                    std::transform(lowerTagScope.begin(), lowerTagScope.end(), lowerTagScope.begin(), ::tolower);
                    if (lowerTagScope.find("vegan") != std::string::npos) item.tags.push_back("Vegan");
                    if (lowerTagScope.find("vegetarian") != std::string::npos) item.tags.push_back("Vegetarian");
                    if (lowerTagScope.find("halal") != std::string::npos) item.tags.push_back("Halal");
                    if (lowerTagScope.find("gluten-free") != std::string::npos || lowerTagScope.find("glutenfree") != std::string::npos) {
                        item.tags.push_back("Gluten-Free");
                    }

                    items.push_back(std::move(item));
                }

                itPos = itemBlockEnd;
            }

            stPos = stEnd;
        }
    }

    return items;
}

std::vector<MenuItem> HtmlParser::getFallbackBursleyMenu() {
    return {
        // Breakfast
        MenuItem{
            .id = "b-1",
            .name = "Oatmeal",
            .mealPeriod = "breakfast",
            .station = "Hot Cereal",
            .servingSize = "Cups (253g)",
            .calories = 183,
            .protein_g = 6,
            .carbs_g = 33,
            .fat_g = 3,
            .satFat_g = 1,
            .transFat_g = 0,
            .cholesterol_mg = 0,
            .sodium_mg = 3,
            .sugar_g = 1,
            .fiber_g = 5,
            .tags = {"Vegan", "Gluten-Free"}
        },
        MenuItem{
            .id = "b-2",
            .name = "Deep Fried Hashbrowns",
            .mealPeriod = "breakfast",
            .station = "Toast",
            .servingSize = "2 Tritaters (113g)",
            .calories = 207,
            .protein_g = 2,
            .carbs_g = 22,
            .fat_g = 15,
            .satFat_g = 2,
            .transFat_g = 0,
            .cholesterol_mg = 0,
            .sodium_mg = 506,
            .sugar_g = 0,
            .fiber_g = 2,
            .tags = {"Vegan"}
        },
        MenuItem{
            .id = "b-3",
            .name = "Pork Sausage Patty",
            .mealPeriod = "breakfast",
            .station = "Toast",
            .servingSize = "Patty (43g)",
            .calories = 179,
            .protein_g = 6,
            .carbs_g = 0,
            .fat_g = 16,
            .satFat_g = 6,
            .transFat_g = 0,
            .cholesterol_mg = 40,
            .sodium_mg = 284,
            .sugar_g = 0,
            .fiber_g = 0,
            .tags = {"Gluten-Free"}
        },
        MenuItem{
            .id = "b-4",
            .name = "Scrambled Eggs",
            .mealPeriod = "breakfast",
            .station = "Toast",
            .servingSize = "1/2 cup (84g)",
            .calories = 163,
            .protein_g = 11,
            .carbs_g = 0,
            .fat_g = 12,
            .satFat_g = 4,
            .transFat_g = 0,
            .cholesterol_mg = 350,
            .sodium_mg = 116,
            .sugar_g = 0,
            .fiber_g = 0,
            .tags = {"Gluten-Free", "Vegetarian"}
        },
        MenuItem{
            .id = "b-5",
            .name = "French Toast Strata w/ Strawberry",
            .mealPeriod = "breakfast",
            .station = "Toast",
            .servingSize = "Piece (263g)",
            .calories = 543,
            .protein_g = 14,
            .carbs_g = 76,
            .fat_g = 22,
            .satFat_g = 11,
            .transFat_g = 0,
            .cholesterol_mg = 120,
            .sodium_mg = 446,
            .sugar_g = 46,
            .fiber_g = 3,
            .tags = {"Vegetarian"}
        },
        MenuItem{
            .id = "b-6",
            .name = "Garden Scrambled Tofu",
            .mealPeriod = "breakfast",
            .station = "Toast",
            .servingSize = "1/2 Cup (113g)",
            .calories = 74,
            .protein_g = 7,
            .carbs_g = 6,
            .fat_g = 3,
            .satFat_g = 1,
            .transFat_g = 0,
            .cholesterol_mg = 0,
            .sodium_mg = 470,
            .sugar_g = 3,
            .fiber_g = 2,
            .tags = {"Vegan", "Gluten-Free"}
        },
        // Lunch
        MenuItem{
            .id = "l-1",
            .name = "Grilled Herb Chicken Breast",
            .mealPeriod = "lunch",
            .station = "Signature",
            .servingSize = "1 Fillet (140g)",
            .calories = 230,
            .protein_g = 41,
            .carbs_g = 1,
            .fat_g = 6,
            .satFat_g = 1.5,
            .transFat_g = 0,
            .cholesterol_mg = 95,
            .sodium_mg = 520,
            .sugar_g = 0,
            .fiber_g = 0,
            .tags = {"Halal", "Gluten-Free"}
        },
        MenuItem{
            .id = "l-2",
            .name = "Penne Marinara with Parmesan",
            .mealPeriod = "lunch",
            .station = "Pasta",
            .servingSize = "1 Cup (190g)",
            .calories = 340,
            .protein_g = 12,
            .carbs_g = 56,
            .fat_g = 7,
            .satFat_g = 2.5,
            .transFat_g = 0,
            .cholesterol_mg = 15,
            .sodium_mg = 610,
            .sugar_g = 7,
            .fiber_g = 4,
            .tags = {"Vegetarian"}
        },
        // Dinner
        MenuItem{
            .id = "d-1",
            .name = "Roasted Garlic Chicken Thighs",
            .mealPeriod = "dinner",
            .station = "Homestyle",
            .servingSize = "2 Pieces (165g)",
            .calories = 310,
            .protein_g = 34,
            .carbs_g = 3,
            .fat_g = 18,
            .satFat_g = 5,
            .transFat_g = 0,
            .cholesterol_mg = 135,
            .sodium_mg = 680,
            .sugar_g = 1,
            .fiber_g = 0,
            .tags = {"Halal", "Gluten-Free"}
        },
        MenuItem{
            .id = "d-2",
            .name = "Steamed Broccoli Florets",
            .mealPeriod = "dinner",
            .station = "Homestyle",
            .servingSize = "1/2 Cup (78g)",
            .calories = 27,
            .protein_g = 1.9,
            .carbs_g = 5.6,
            .fat_g = 0.3,
            .satFat_g = 0,
            .transFat_g = 0,
            .cholesterol_mg = 0,
            .sodium_mg = 32,
            .sugar_g = 1.1,
            .fiber_g = 2.4,
            .tags = {"Vegan", "Gluten-Free"}
        }
    };
}

} // namespace sodium
