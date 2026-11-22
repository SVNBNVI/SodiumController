#include "html_parser.hpp"
#include <regex>
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdlib>

namespace sodium {

namespace {

void appendUtf8(std::string& out, uint32_t cp) {
    if (cp == 0 || (cp >= 0xD800 && cp <= 0xDFFF) || cp > 0x10FFFF) {
        return;
    }
    if (cp <= 0x7F) {
        out.push_back(static_cast<char>(cp));
    } else if (cp <= 0x7FF) {
        out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0xFFFF) {
        out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
}

bool isInlineFormattingTag(std::string_view tagName) {
    return tagName == "b" || tagName == "i" || tagName == "em" ||
           tagName == "u" || tagName == "sub" || tagName == "sup" ||
           tagName == "small" || tagName == "abbr";
}

double matchPrebuiltRegex(const std::string& text, const std::regex& re) {
    std::smatch m;
    if (std::regex_search(text, m, re)) {
        if (m.size() > 2 && m[2].matched) {
            double val = std::stod(m[2].str());
            return m[1].matched ? (val * 0.5) : val;
        }
        if (m.size() > 1 && m[1].matched) {
            return std::stod(m[1].str());
        }
    }
    return 0.0;
}

bool containsWord(const std::string& lowerText, std::string_view word) {
    size_t pos = 0;
    while ((pos = lowerText.find(word, pos)) != std::string::npos) {
        bool leftOk = (pos == 0) || !std::isalpha(static_cast<unsigned char>(lowerText[pos - 1]));
        size_t end = pos + word.size();
        bool rightOk = (end >= lowerText.size()) || !std::isalpha(static_cast<unsigned char>(lowerText[end]));
        if (leftOk && rightOk) return true;
        pos = end;
    }
    return false;
}

} // namespace

std::string HtmlParser::stripHtml(std::string_view html) {
    std::string result;
    result.reserve(html.size());

    size_t i = 0;
    const size_t n = html.size();

    while (i < n) {
        if (html[i] == '<' && i + 1 < n) {
            unsigned char next = static_cast<unsigned char>(html[i + 1]);
            if (std::isalpha(next) || next == '/' || next == '!' || next == '?') {
                size_t closePos = html.find('>', i + 1);
                if (closePos != std::string_view::npos) {
                    // Extract tag name to decide whether to insert a token-separating space
                    size_t nameStart = i + 1;
                    if (html[nameStart] == '/') nameStart++;
                    size_t nameEnd = nameStart;
                    while (nameEnd < closePos && std::isalnum(static_cast<unsigned char>(html[nameEnd]))) {
                        nameEnd++;
                    }
                    std::string tagLower;
                    tagLower.reserve(nameEnd - nameStart);
                    for (size_t k = nameStart; k < nameEnd; ++k) {
                        tagLower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(html[k]))));
                    }
                    if (!tagLower.empty() && !isInlineFormattingTag(tagLower)) {
                        if (!result.empty() && !std::isspace(static_cast<unsigned char>(result.back()))) {
                            result.push_back(' ');
                        }
                    }
                    i = closePos + 1;
                    continue;
                }
            }
        }
        result.push_back(html[i]);
        ++i;
    }

    return unescapeHtml(result);
}

std::string HtmlParser::unescapeHtml(std::string_view input) {
    std::string decoded;
    decoded.reserve(input.size());

    size_t i = 0;
    const size_t n = input.size();
    while (i < n) {
        if (input[i] == '&') {
            size_t semi = input.find(';', i + 1);
            if (semi != std::string_view::npos && (semi - i) <= 12) {
                std::string_view entity = input.substr(i + 1, semi - i - 1);
                bool handled = true;

                if (!entity.empty() && entity[0] == '#') {
                    uint32_t cp = 0;
                    bool validNum = false;
                    if (entity.size() > 2 && (entity[1] == 'x' || entity[1] == 'X')) {
                        validNum = true;
                        for (size_t k = 2; k < entity.size(); ++k) {
                            char ch = entity[k];
                            uint32_t digit = 0;
                            if (ch >= '0' && ch <= '9') digit = static_cast<uint32_t>(ch - '0');
                            else if (ch >= 'a' && ch <= 'f') digit = static_cast<uint32_t>(ch - 'a' + 10);
                            else if (ch >= 'A' && ch <= 'F') digit = static_cast<uint32_t>(ch - 'A' + 10);
                            else { validNum = false; break; }
                            cp = (cp << 4) | digit;
                            if (cp > 0x10FFFF) { validNum = false; break; }
                        }
                    } else if (entity.size() > 1) {
                        validNum = true;
                        for (size_t k = 1; k < entity.size(); ++k) {
                            char ch = entity[k];
                            if (ch < '0' || ch > '9') { validNum = false; break; }
                            cp = cp * 10 + static_cast<uint32_t>(ch - '0');
                            if (cp > 0x10FFFF) { validNum = false; break; }
                        }
                    }
                    if (validNum && cp > 0) {
                        if (cp == 160) decoded.push_back(' ');
                        else appendUtf8(decoded, cp);
                    } else {
                        handled = false;
                    }
                } else if (entity == "nbsp") {
                    decoded.push_back(' ');
                } else if (entity == "amp") {
                    decoded.push_back('&');
                } else if (entity == "lt") {
                    decoded.push_back('<');
                } else if (entity == "gt") {
                    decoded.push_back('>');
                } else if (entity == "quot") {
                    decoded.push_back('"');
                } else if (entity == "apos") {
                    decoded.push_back('\'');
                } else if (entity == "rsquo" || entity == "lsquo") {
                    decoded.push_back('\'');
                } else if (entity == "rdquo" || entity == "ldquo") {
                    decoded.push_back('"');
                } else if (entity == "ndash") {
                    decoded.append("\xE2\x80\x93");
                } else if (entity == "mdash") {
                    decoded.append("\xE2\x80\x94");
                } else if (entity == "eacute") {
                    decoded.append("\xC3\xA9");
                } else if (entity == "Eacute") {
                    decoded.append("\xC3\x89");
                } else if (entity == "egrave") {
                    decoded.append("\xC3\xA8");
                } else if (entity == "ntilde") {
                    decoded.append("\xC3\xB1");
                } else if (entity == "Ntilde") {
                    decoded.append("\xC3\x91");
                } else if (entity == "uuml") {
                    decoded.append("\xC3\xBC");
                } else {
                    handled = false;
                }

                if (handled) {
                    i = semi + 1;
                    continue;
                }
            }
        }
        decoded.push_back(input[i]);
        ++i;
    }

    // Collapse consecutive whitespace and trim in single pass
    std::string clean;
    clean.reserve(decoded.size());
    bool inSpace = true; // true initially to skip leading whitespace
    for (char c : decoded) {
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
    if (!clean.empty() && clean.back() == ' ') {
        clean.pop_back();
    }
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

std::vector<std::string> HtmlParser::extractAllergens(std::string_view htmlScope) {
    std::string lowerScope(htmlScope);
    std::transform(lowerScope.begin(), lowerScope.end(), lowerScope.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    // Prefer the explicit <div class="allergens"> block to avoid matching class attributes on outer <li>
    size_t algStart = lowerScope.find("class=\"allergens\"");
    if (algStart == std::string::npos) {
        algStart = lowerScope.find("class='allergens'");
    }
    if (algStart == std::string::npos) {
        algStart = lowerScope.find("contains:");
    }
    if (algStart == std::string::npos) {
        algStart = lowerScope.find("allergens:");
    }
    if (algStart == std::string::npos) {
        return {};
    }

    size_t closeDiv = lowerScope.find("</div>", algStart);
    size_t endPos = (closeDiv != std::string::npos) ? (closeDiv + 6) : lowerScope.size();
    std::string allergenSection = stripHtml(htmlScope.substr(algStart, endPos - algStart));
    std::transform(allergenSection.begin(), allergenSection.end(), allergenSection.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    // Guard against "no allergens" / "none"
    if (allergenSection.find("no known") != std::string::npos ||
        allergenSection.find("allergens: none") != std::string::npos) {
        return {};
    }

    std::vector<std::string> found;
    auto addUnique = [&found](const char* label) {
        if (std::find(found.begin(), found.end(), label) == found.end()) {
            found.emplace_back(label);
        }
    };

    if (containsWord(allergenSection, "milk") || containsWord(allergenSection, "dairy")) addUnique("Milk");
    if (containsWord(allergenSection, "eggs") || containsWord(allergenSection, "egg")) addUnique("Eggs");
    if (containsWord(allergenSection, "shellfish") || containsWord(allergenSection, "crustacean")) addUnique("Shellfish");
    if (containsWord(allergenSection, "fish")) addUnique("Fish");
    if (allergenSection.find("tree nut") != std::string::npos ||
        allergenSection.find("tree-nut") != std::string::npos ||
        containsWord(allergenSection, "almonds") || containsWord(allergenSection, "almond") ||
        containsWord(allergenSection, "walnuts") || containsWord(allergenSection, "walnut") ||
        containsWord(allergenSection, "pecans") || containsWord(allergenSection, "pecan") ||
        containsWord(allergenSection, "cashews") || containsWord(allergenSection, "cashew") ||
        containsWord(allergenSection, "pistachios") || containsWord(allergenSection, "hazelnuts")) {
        addUnique("Tree Nuts");
    }
    if (containsWord(allergenSection, "peanuts") || containsWord(allergenSection, "peanut")) addUnique("Peanuts");
    if (containsWord(allergenSection, "wheat") || allergenSection.find("wheat_barley_rye") != std::string::npos) {
        addUnique("Wheat");
    }
    if (containsWord(allergenSection, "soy") || containsWord(allergenSection, "soybean") || containsWord(allergenSection, "soybeans")) {
        addUnique("Soy");
    }
    if (containsWord(allergenSection, "sesame")) addUnique("Sesame");

    return found;
}

std::vector<MenuItem> HtmlParser::parseBursleyHtml(const std::string& html) {
    return parseDiningHallHtml(html, "bursley");
}

std::vector<MenuItem> HtmlParser::parseDiningHallHtml(const std::string& html, const std::string& hallSlug) {
    // Precompiled static regexes (compiled once per process instead of 11x per menu item)
    static const std::regex servingRe(R"(Serving Size:?\s*(?:</strong>)?\s*([^<\r\n]+))", std::regex_constants::icase);
    static const std::regex caloriesRe(R"(Calories:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?))", std::regex_constants::icase);
    static const std::regex fatRe(R"(Total Fat:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex satFatRe(R"(Saturated Fat:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex transFatRe(R"(Trans Fat:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex cholesterolRe(R"(Cholesterol:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*mg)", std::regex_constants::icase);
    static const std::regex sodiumRe(R"(Sodium:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*mg)", std::regex_constants::icase);
    static const std::regex carbsRe(R"(Total Carbohydrate:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex fiberRe(R"(Dietary Fiber:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex sugarRe(R"((?:Total\s+)?Sugars:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);
    static const std::regex proteinRe(R"(Protein:?\s*(<\s*)?([0-9]+(?:\.[0-9]+)?)\s*g)", std::regex_constants::icase);

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
        std::transform(lowerH3.begin(), lowerH3.end(), lowerH3.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

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

            std::string stationName = stripHtml(std::string_view(mealBody).substr(h4Close + 1, h4End - h4Close - 1));
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

                std::string dishName = stripHtml(std::string_view(stationBody).substr(nameTagClose + 1, nameEnd - nameTagClose - 1));

                size_t nextItem = stationBody.find("class=\"item-name\"", nameEnd);
                if (nextItem == std::string::npos) nextItem = stationBody.find("class='item-name'", nameEnd);
                size_t itemBlockEnd = stationBody.size();
                if (nextItem != std::string::npos) {
                    // Stop before the next dish's wrapping <li ...> tag so its traits don't bleed into this dish
                    size_t nextLi = stationBody.rfind("<li", nextItem);
                    itemBlockEnd = (nextLi != std::string::npos && nextLi > nameEnd) ? nextLi : nextItem;
                }

                std::string itemBlock = stationBody.substr(nameEnd, itemBlockEnd - nameEnd);

                bool hasUnavailableNutrition =
                    (itemBlock.find("no-nutrition-facts") != std::string::npos) ||
                    (itemBlock.find("Nutrition Facts are unavailable") != std::string::npos);

                if (!dishName.empty() && !hasUnavailableNutrition &&
                    (itemBlock.find("Nutrition Facts") != std::string::npos ||
                     itemBlock.find("nutrition-facts") != std::string::npos ||
                     itemBlock.find("Calories") != std::string::npos)) {
                    MenuItem item;
                    item.id = "sc-" + hallSlug + "-" + meal.name + "-" + std::to_string(idCounter++);
                    item.name = dishName;
                    item.mealPeriod = meal.name;
                    item.station = stationName;

                    // Extract serving size
                    std::smatch servingMatch;
                    if (std::regex_search(itemBlock, servingMatch, servingRe) && servingMatch.size() > 1) {
                        std::string rawServing = stripHtml(servingMatch[1].str());
                        size_t cutAmt = rawServing.find("Amount Per Serving");
                        if (cutAmt != std::string::npos) rawServing = rawServing.substr(0, cutAmt);
                        size_t cutCal = rawServing.find("Calories");
                        if (cutCal != std::string::npos) rawServing = rawServing.substr(0, cutCal);
                        item.servingSize = unescapeHtml(rawServing);
                        if (item.servingSize.empty()) item.servingSize = "1 serving";
                    } else {
                        item.servingSize = "1 serving";
                    }

                    // Extract numeric nutrition values using precompiled regexes
                    std::string plainText = stripHtml(itemBlock);
                    item.calories = matchPrebuiltRegex(plainText, caloriesRe);
                    item.fat_g = matchPrebuiltRegex(plainText, fatRe);
                    item.satFat_g = matchPrebuiltRegex(plainText, satFatRe);
                    item.transFat_g = matchPrebuiltRegex(plainText, transFatRe);
                    item.cholesterol_mg = matchPrebuiltRegex(plainText, cholesterolRe);
                    item.sodium_mg = matchPrebuiltRegex(plainText, sodiumRe);
                    item.carbs_g = matchPrebuiltRegex(plainText, carbsRe);
                    item.fiber_g = matchPrebuiltRegex(plainText, fiberRe);
                    item.sugar_g = matchPrebuiltRegex(plainText, sugarRe);
                    item.protein_g = matchPrebuiltRegex(plainText, proteinRe);

                    // Tags / traits: search both pre-tag (e.g. <li class="trait-vegan">) and item body
                    size_t tagSearchStart = spanStart;
                    size_t liStart = stationBody.rfind("<li", spanStart);
                    if (liStart != std::string::npos && (itPos == 0 || liStart >= itPos)) {
                        tagSearchStart = liStart;
                    }
                    std::string_view tagScopeView = std::string_view(stationBody).substr(tagSearchStart, itemBlockEnd - tagSearchStart);
                    std::string lowerTagScope(tagScopeView);
                    std::transform(lowerTagScope.begin(), lowerTagScope.end(), lowerTagScope.begin(),
                                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

                    if (lowerTagScope.find("vegan") != std::string::npos) item.tags.push_back("Vegan");
                    if (lowerTagScope.find("vegetarian") != std::string::npos) item.tags.push_back("Vegetarian");
                    if (lowerTagScope.find("halal") != std::string::npos) item.tags.push_back("Halal");
                    if (lowerTagScope.find("gluten-free") != std::string::npos ||
                        lowerTagScope.find("glutenfree") != std::string::npos ||
                        lowerTagScope.find("gluten free") != std::string::npos) {
                        item.tags.push_back("Gluten-Free");
                    }

                    // Extract FDA Big-9 allergens
                    item.allergens = extractAllergens(tagScopeView);

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
            .tags = {"Vegan", "Gluten-Free"},
            .allergens = {}
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
            .tags = {"Vegan"},
            .allergens = {}
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
            .tags = {"Gluten-Free"},
            .allergens = {}
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
            .tags = {"Gluten-Free", "Vegetarian"},
            .allergens = {"Eggs"}
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
            .tags = {"Vegetarian"},
            .allergens = {"Eggs", "Milk", "Wheat"}
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
            .tags = {"Vegan", "Gluten-Free"},
            .allergens = {"Soy"}
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
            .tags = {"Halal", "Gluten-Free"},
            .allergens = {}
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
            .tags = {"Vegetarian"},
            .allergens = {"Milk", "Wheat"}
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
            .tags = {"Halal", "Gluten-Free"},
            .allergens = {}
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
            .tags = {"Vegan", "Gluten-Free"},
            .allergens = {}
        }
    };
}

std::vector<MenuItem> HtmlParser::getFallbackMenuForHall(const std::string& hallSlug) {
    if (hallSlug == "bursley" || hallSlug.empty()) {
        return getFallbackBursleyMenu();
    }

    if (hallSlug == "south-quad") {
        return {
            MenuItem{.id = "sq-b-1", .name = "Buttermilk Pancakes", .mealPeriod = "breakfast", .station = "24 Carrots", .servingSize = "2 Pancakes (116g)", .calories = 260, .protein_g = 7, .carbs_g = 44, .fat_g = 6, .satFat_g = 1.5, .transFat_g = 0, .cholesterol_mg = 35, .sodium_mg = 540, .sugar_g = 9, .fiber_g = 1.5, .tags = {"Vegetarian"}, .allergens = {"Eggs", "Milk", "Wheat"}},
            MenuItem{.id = "sq-b-2", .name = "Cage-Free Egg White Omelet", .mealPeriod = "breakfast", .station = "Grill", .servingSize = "1 Omelet (120g)", .calories = 95, .protein_g = 16, .carbs_g = 2, .fat_g = 2, .satFat_g = 0.5, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 190, .sugar_g = 1, .fiber_g = 0, .tags = {"Vegetarian", "Gluten-Free"}, .allergens = {"Eggs"}},
            MenuItem{.id = "sq-b-3", .name = "Seasoned Breakfast Potatoes", .mealPeriod = "breakfast", .station = "Grill", .servingSize = "1/2 Cup (105g)", .calories = 165, .protein_g = 3, .carbs_g = 24, .fat_g = 6, .satFat_g = 0.8, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 390, .sugar_g = 1, .fiber_g = 2.5, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "sq-l-1", .name = "Chipotle Chicken Burrito Bowl", .mealPeriod = "lunch", .station = "Latin", .servingSize = "1 Bowl (280g)", .calories = 460, .protein_g = 36, .carbs_g = 48, .fat_g = 13, .satFat_g = 3.5, .transFat_g = 0, .cholesterol_mg = 85, .sodium_mg = 890, .sugar_g = 3, .fiber_g = 7, .tags = {"Halal", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "sq-l-2", .name = "Black Bean & Roasted Corn Quesadilla", .mealPeriod = "lunch", .station = "Latin", .servingSize = "1 Quesadilla (175g)", .calories = 410, .protein_g = 17, .carbs_g = 46, .fat_g = 18, .satFat_g = 8, .transFat_g = 0, .cholesterol_mg = 35, .sodium_mg = 760, .sugar_g = 3, .fiber_g = 6, .tags = {"Vegetarian"}, .allergens = {"Milk", "Wheat"}},
            MenuItem{.id = "sq-d-1", .name = "Smoked Beef Brisket", .mealPeriod = "dinner", .station = "Smoke & Spice", .servingSize = "4 oz (113g)", .calories = 340, .protein_g = 29, .carbs_g = 4, .fat_g = 23, .satFat_g = 9, .transFat_g = 0.5, .cholesterol_mg = 95, .sodium_mg = 720, .sugar_g = 3, .fiber_g = 0, .tags = {"Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "sq-d-2", .name = "Roasted Sweet Potato Wedges", .mealPeriod = "dinner", .station = "Kosher", .servingSize = "1/2 Cup (110g)", .calories = 130, .protein_g = 2, .carbs_g = 25, .fat_g = 2.5, .satFat_g = 0.4, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 95, .sugar_g = 6, .fiber_g = 4, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}}
        };
    }

    if (hallSlug == "east-quad") {
        return {
            MenuItem{.id = "eq-b-1", .name = "Overnight Chia Berry Oats", .mealPeriod = "breakfast", .station = "Plant-Based", .servingSize = "1 Cup (210g)", .calories = 240, .protein_g = 7, .carbs_g = 38, .fat_g = 7, .satFat_g = 1, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 45, .sugar_g = 11, .fiber_g = 8, .tags = {"Vegan", "Gluten-Free"}, .allergens = {"Soy"}},
            MenuItem{.id = "eq-b-2", .name = "Spinach & Feta Frittata", .mealPeriod = "breakfast", .station = "Homestyle", .servingSize = "1 Wedge (130g)", .calories = 210, .protein_g = 14, .carbs_g = 4, .fat_g = 15, .satFat_g = 6, .transFat_g = 0, .cholesterol_mg = 265, .sodium_mg = 430, .sugar_g = 2, .fiber_g = 1, .tags = {"Vegetarian", "Gluten-Free"}, .allergens = {"Eggs", "Milk"}},
            MenuItem{.id = "eq-l-1", .name = "Chana Masala Chickpea Curry", .mealPeriod = "lunch", .station = "Curry Up", .servingSize = "1 Cup (220g)", .calories = 290, .protein_g = 12, .carbs_g = 42, .fat_g = 8, .satFat_g = 1, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 640, .sugar_g = 6, .fiber_g = 10, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "eq-l-2", .name = "Steamed Basmati Rice", .mealPeriod = "lunch", .station = "Curry Up", .servingSize = "3/4 Cup (140g)", .calories = 180, .protein_g = 4, .carbs_g = 39, .fat_g = 0.5, .satFat_g = 0, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 15, .sugar_g = 0, .fiber_g = 1, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "eq-d-1", .name = "Crispy Sesame Tofu Stir-Fry", .mealPeriod = "dinner", .station = "Plant-Based", .servingSize = "1 Cup (200g)", .calories = 320, .protein_g = 18, .carbs_g = 28, .fat_g = 15, .satFat_g = 2.5, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 820, .sugar_g = 9, .fiber_g = 4, .tags = {"Vegan"}, .allergens = {"Soy", "Wheat", "Sesame"}},
            MenuItem{.id = "eq-d-2", .name = "Herb-Baked Atlantic Salmon", .mealPeriod = "dinner", .station = "Signature", .servingSize = "1 Fillet (125g)", .calories = 260, .protein_g = 28, .carbs_g = 1, .fat_g = 15, .satFat_g = 3, .transFat_g = 0, .cholesterol_mg = 75, .sodium_mg = 290, .sugar_g = 0, .fiber_g = 0, .tags = {"Gluten-Free"}, .allergens = {"Fish"}}
        };
    }

    if (hallSlug == "mosher-jordan") {
        return {
            MenuItem{.id = "mj-b-1", .name = "Belgian Waffle", .mealPeriod = "breakfast", .station = "Waffle Bar", .servingSize = "1 Waffle (110g)", .calories = 310, .protein_g = 8, .carbs_g = 45, .fat_g = 11, .satFat_g = 4, .transFat_g = 0, .cholesterol_mg = 55, .sodium_mg = 480, .sugar_g = 10, .fiber_g = 1.5, .tags = {"Vegetarian"}, .allergens = {"Eggs", "Milk", "Wheat", "Soy"}},
            MenuItem{.id = "mj-b-2", .name = "Turkey Sausage Links", .mealPeriod = "breakfast", .station = "Marketplace", .servingSize = "2 Links (56g)", .calories = 110, .protein_g = 10, .carbs_g = 1, .fat_g = 7, .satFat_g = 2, .transFat_g = 0, .cholesterol_mg = 45, .sodium_mg = 410, .sugar_g = 0, .fiber_g = 0, .tags = {"Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "mj-l-1", .name = "Wood-Fired Margherita Pizza", .mealPeriod = "lunch", .station = "Hearth", .servingSize = "1 Slice (128g)", .calories = 295, .protein_g = 13, .carbs_g = 36, .fat_g = 11, .satFat_g = 5, .transFat_g = 0, .cholesterol_mg = 25, .sodium_mg = 670, .sugar_g = 4, .fiber_g = 2, .tags = {"Vegetarian"}, .allergens = {"Milk", "Wheat"}},
            MenuItem{.id = "mj-l-2", .name = "Grilled Turkey Burger on Brioche", .mealPeriod = "lunch", .station = "Grille", .servingSize = "1 Sandwich (195g)", .calories = 430, .protein_g = 32, .carbs_g = 34, .fat_g = 18, .satFat_g = 5, .transFat_g = 0, .cholesterol_mg = 95, .sodium_mg = 740, .sugar_g = 6, .fiber_g = 2, .tags = {}, .allergens = {"Eggs", "Milk", "Wheat"}},
            MenuItem{.id = "mj-d-1", .name = "Lemon Rosemary Roasted Chicken", .mealPeriod = "dinner", .station = "Marketplace", .servingSize = "1 Quarter (155g)", .calories = 285, .protein_g = 35, .carbs_g = 2, .fat_g = 15, .satFat_g = 4, .transFat_g = 0, .cholesterol_mg = 115, .sodium_mg = 460, .sugar_g = 0, .fiber_g = 0, .tags = {"Halal", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "mj-d-2", .name = "Garlic Green Beans", .mealPeriod = "dinner", .station = "Marketplace", .servingSize = "1/2 Cup (85g)", .calories = 55, .protein_g = 2, .carbs_g = 7, .fat_g = 2.5, .satFat_g = 0.3, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 120, .sugar_g = 2, .fiber_g = 3, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}}
        };
    }

    if (hallSlug == "north-quad") {
        return {
            MenuItem{.id = "nq-b-1", .name = "Steel Cut Oats with Cinnamon Apples", .mealPeriod = "breakfast", .station = "Maize & Grains", .servingSize = "1 Cup (240g)", .calories = 215, .protein_g = 6, .carbs_g = 41, .fat_g = 3.5, .satFat_g = 0.6, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 18, .sugar_g = 10, .fiber_g = 6, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}},
            MenuItem{.id = "nq-b-2", .name = "Hard-Boiled Cage-Free Eggs", .mealPeriod = "breakfast", .station = "Maize & Grains", .servingSize = "2 Eggs (100g)", .calories = 155, .protein_g = 13, .carbs_g = 1, .fat_g = 11, .satFat_g = 3.3, .transFat_g = 0, .cholesterol_mg = 370, .sodium_mg = 124, .sugar_g = 1, .fiber_g = 0, .tags = {"Vegetarian", "Gluten-Free"}, .allergens = {"Eggs"}},
            MenuItem{.id = "nq-l-1", .name = "Korean Bibimbap Rice Bowl", .mealPeriod = "lunch", .station = "Global Kitchen", .servingSize = "1 Bowl (310g)", .calories = 510, .protein_g = 27, .carbs_g = 64, .fat_g = 16, .satFat_g = 3.5, .transFat_g = 0, .cholesterol_mg = 195, .sodium_mg = 980, .sugar_g = 11, .fiber_g = 5, .tags = {"Halal"}, .allergens = {"Eggs", "Soy", "Wheat", "Sesame"}},
            MenuItem{.id = "nq-l-2", .name = "Miso Tofu Soup", .mealPeriod = "lunch", .station = "Global Kitchen", .servingSize = "1 Cup (240ml)", .calories = 75, .protein_g = 5, .carbs_g = 7, .fat_g = 3, .satFat_g = 0.5, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 790, .sugar_g = 2, .fiber_g = 1, .tags = {"Vegan"}, .allergens = {"Soy"}},
            MenuItem{.id = "nq-d-1", .name = "Mediterranean Baked Cod", .mealPeriod = "dinner", .station = "Global Kitchen", .servingSize = "1 Fillet (140g)", .calories = 195, .protein_g = 31, .carbs_g = 4, .fat_g = 6, .satFat_g = 1, .transFat_g = 0, .cholesterol_mg = 70, .sodium_mg = 340, .sugar_g = 2, .fiber_g = 1, .tags = {"Gluten-Free"}, .allergens = {"Fish"}},
            MenuItem{.id = "nq-d-2", .name = "Quinoa Tabbouleh Salad", .mealPeriod = "dinner", .station = "Maize & Grains", .servingSize = "3/4 Cup (135g)", .calories = 175, .protein_g = 5, .carbs_g = 26, .fat_g = 6, .satFat_g = 0.8, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 210, .sugar_g = 2, .fiber_g = 4, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}}
        };
    }

    // Default / Markley Dining Hall
    return {
        MenuItem{.id = "mk-b-1", .name = "Scrambled Eggs with Chives", .mealPeriod = "breakfast", .station = "Homestyle", .servingSize = "1/2 Cup (90g)", .calories = 170, .protein_g = 12, .carbs_g = 1, .fat_g = 12, .satFat_g = 4, .transFat_g = 0, .cholesterol_mg = 355, .sodium_mg = 135, .sugar_g = 0, .fiber_g = 0, .tags = {"Vegetarian", "Gluten-Free"}, .allergens = {"Eggs"}},
        MenuItem{.id = "mk-b-2", .name = "Whole Wheat Bagel", .mealPeriod = "breakfast", .station = "MBakery", .servingSize = "1 Bagel (95g)", .calories = 250, .protein_g = 10, .carbs_g = 49, .fat_g = 2, .satFat_g = 0.4, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 430, .sugar_g = 5, .fiber_g = 6, .tags = {"Vegan"}, .allergens = {"Wheat", "Sesame"}},
        MenuItem{.id = "mk-l-1", .name = "Build-Your-Own Personal Veggie Pizza", .mealPeriod = "lunch", .station = "Make Your Own Pizza", .servingSize = "1 Personal Pie (210g)", .calories = 490, .protein_g = 21, .carbs_g = 58, .fat_g = 19, .satFat_g = 8, .transFat_g = 0, .cholesterol_mg = 40, .sodium_mg = 940, .sugar_g = 6, .fiber_g = 4, .tags = {"Vegetarian"}, .allergens = {"Milk", "Wheat"}},
        MenuItem{.id = "mk-l-2", .name = "Grilled Lemon Pepper Chicken", .mealPeriod = "lunch", .station = "Homestyle", .servingSize = "1 Breast (135g)", .calories = 220, .protein_g = 39, .carbs_g = 1, .fat_g = 5.5, .satFat_g = 1.3, .transFat_g = 0, .cholesterol_mg = 90, .sodium_mg = 380, .sugar_g = 0, .fiber_g = 0, .tags = {"Halal", "Gluten-Free"}, .allergens = {}},
        MenuItem{.id = "mk-d-1", .name = "Turkey Meatballs Marinara", .mealPeriod = "dinner", .station = "Homestyle", .servingSize = "4 Meatballs (150g)", .calories = 290, .protein_g = 24, .carbs_g = 14, .fat_g = 15, .satFat_g = 4, .transFat_g = 0, .cholesterol_mg = 85, .sodium_mg = 690, .sugar_g = 6, .fiber_g = 2, .tags = {}, .allergens = {"Eggs", "Milk", "Wheat"}},
        MenuItem{.id = "mk-d-2", .name = "Roasted Zucchini & Summer Squash", .mealPeriod = "dinner", .station = "Homestyle", .servingSize = "1/2 Cup (95g)", .calories = 48, .protein_g = 1.5, .carbs_g = 5, .fat_g = 2.5, .satFat_g = 0.3, .transFat_g = 0, .cholesterol_mg = 0, .sodium_mg = 65, .sugar_g = 3, .fiber_g = 1.8, .tags = {"Vegan", "Gluten-Free"}, .allergens = {}}
    };
}

} // namespace sodium
