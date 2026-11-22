#include "menu_item.hpp"
#include "html_parser.hpp"
#include "nutrition_calculator.hpp"

#include <iostream>
#include <cmath>
#include <limits>
#include <string>
#include <vector>

namespace {

int g_passedChecks = 0;
int g_failedChecks = 0;

void checkImpl(bool cond, const char* expr, const char* file, int line) {
    if (cond) {
        ++g_passedChecks;
    } else {
        ++g_failedChecks;
        std::cerr << "  [FAIL] " << file << ":" << line << " — Expected: " << expr << "\n";
    }
}

void checkNearImpl(double actual, double expected, double eps, const char* expr, const char* file, int line) {
    if (std::fabs(actual - expected) <= eps) {
        ++g_passedChecks;
    } else {
        ++g_failedChecks;
        std::cerr << "  [FAIL] " << file << ":" << line << " — " << expr
                  << " (actual=" << actual << ", expected=" << expected << ")\n";
    }
}

#define SC_CHECK(cond) checkImpl(static_cast<bool>(cond), #cond, __FILE__, __LINE__)
#define SC_CHECK_NEAR(actual, expected, eps) checkNearImpl((actual), (expected), (eps), #actual " ~= " #expected, __FILE__, __LINE__)

} // namespace

void testHtmlUtilitiesAndEntities() {
    std::cout << "[TEST] Running HTML entity & stripHtml edge-case tests...\n";

    // Single-pass entity decoding: &amp;lt; must decode to "&lt;", NOT "<"
    SC_CHECK(sodium::HtmlParser::unescapeHtml("Mac &amp; Cheese") == "Mac & Cheese");
    SC_CHECK(sodium::HtmlParser::unescapeHtml("Safe &amp;lt;script&amp;gt;") == "Safe &lt;script&gt;");
    SC_CHECK(sodium::HtmlParser::unescapeHtml("Saut&#233;ed Jalape&#xF1;o") == "Sautéed Jalapeño");

    // Adjacent table cells without spaces must separate tokens cleanly
    std::string tableRow = "<tr><td>Sodium</td><td>480mg</td></tr>";
    SC_CHECK(sodium::HtmlParser::stripHtml(tableRow) == "Sodium 480mg");

    // Inline formatting inside a single word should not split the word
    SC_CHECK(sodium::HtmlParser::stripHtml("Cr<em>&egrave;</em>me Br&ucirc;l&eacute;e").find("Crème") == 0);

    // Raw '<' in trace nutrition values (e.g. "Total Fat < 1g") must NOT swallow subsequent cells
    std::string traceRow = "<tr><td>Total Fat < 1g</td><td>Sodium 420mg</td></tr>";
    std::string strippedTrace = sodium::HtmlParser::stripHtml(traceRow);
    SC_CHECK(strippedTrace.find("Sodium 420mg") != std::string::npos);

    std::cout << "  ✓ Entity decoding, adjacent cell spacing, and '< 1g' safety verified.\n";
}

void testHtmlParserAndAllergens() {
    std::cout << "[TEST] Running HtmlParser & Multi-Hall Fallback tests...\n";

    const std::vector<std::string> halls = {
        "bursley", "south-quad", "east-quad", "mosher-jordan", "north-quad", "markley"
    };
    for (const auto& slug : halls) {
        auto menu = sodium::HtmlParser::getFallbackMenuForHall(slug);
        SC_CHECK(menu.size() >= 6);
    }
    std::cout << "  ✓ All 6 Ann Arbor residential dining halls provide verified fallback menus.\n";

    // Mock HTML with modern "Total Sugars", trace "< 1g", adjacent <td> cells, and FDA allergens
    std::string mockHtml = R"(
        <div id="mdining-items">
            <h3><a href="#"><i class="fa fa-minus"></i> Breakfast</a></h3>
            <div class="courses">
                <h4>Hot Cereal</h4>
                <ul class="items">
                    <li class="trait-vegan trait-glutenfree">
                        <span class="item-name">Organic Steel Cut Oatmeal</span>
                        <div class="nutrition">
                            <table class="nutrition-facts">
                                <tr class="serving-size"><td>Serving Size 1 Cup (240g)</td></tr>
                                <tr class="portion-calories"><td>Calories</td><td>150</td></tr>
                                <tr><td>Total Fat < 1g</td></tr>
                                <tr><td>Saturated Fat 0.5g</td></tr>
                                <tr><td>Trans Fat 0g</td></tr>
                                <tr><td>Cholesterol 0mg</td></tr>
                                <tr><td>Sodium</td><td>5mg</td></tr>
                                <tr><td>Total Carbohydrate 27g</td></tr>
                                <tr><td>Dietary Fiber 4g</td></tr>
                                <tr><td>Total Sugars 1g</td></tr>
                                <tr><td>Protein 5g</td></tr>
                            </table>
                            <div class="allergens">
                                <h5>Allergens:</h5>
                                <ul><li>Soy</li><li>Sesame</li></ul>
                            </div>
                        </div>
                    </li>
                    <li class="trait-halal allergen-wheat_barley_rye">
                        <span class="item-name">Shrimp &amp; Grits</span>
                        <div class="nutrition">
                            <div class="nutrition_header"></div>
                            <div class="allergens">
                                <h6>Contains:</h6>
                                <ul><li class="milk">milk</li><li class="shellfish">shellfish</li><li class="wheat_barley_rye">wheat/barley/rye</li></ul>
                            </div>
                            <table class="nutrition-facts">
                                <tr class="serving-size"><td>Serving Size 1 Bowl</td></tr>
                                <tr><td>Calories 420</td></tr>
                                <tr><td>Sodium 890mg</td></tr>
                                <tr><td>Protein 26g</td></tr>
                            </table>
                        </div>
                    </li>
                    <li>
                        <span class="item-name">Sandwiches Made to Order</span>
                        <div class="nutrition">
                            <h6 class="no-nutrition-facts small-nutrition-facts">Nutrition Facts are unavailable for this selection.</h6>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    )";

    auto parsed = sodium::HtmlParser::parseDiningHallHtml(mockHtml, "south-quad");
    SC_CHECK(parsed.size() == 2);
    if (parsed.size() == 2) {
        SC_CHECK(parsed[0].id == "sc-south-quad-breakfast-1");
        SC_CHECK(parsed[0].name == "Organic Steel Cut Oatmeal");
        SC_CHECK(parsed[0].mealPeriod == "breakfast");
        SC_CHECK(parsed[0].station == "Hot Cereal");
        SC_CHECK_NEAR(parsed[0].calories, 150.0, 0.01);
        SC_CHECK_NEAR(parsed[0].fat_g, 0.5, 0.01); // "< 1g" -> 0.5g trace
        SC_CHECK_NEAR(parsed[0].sodium_mg, 5.0, 0.01);
        SC_CHECK_NEAR(parsed[0].sugar_g, 1.0, 0.01);
        SC_CHECK_NEAR(parsed[0].protein_g, 5.0, 0.01);
        SC_CHECK(parsed[0].tags.size() == 2);
        SC_CHECK(parsed[0].allergens == std::vector<std::string>({"Soy", "Sesame"}));

        // Verify "Shellfish" does NOT falsely trigger standalone "Fish" allergen
        SC_CHECK(parsed[1].name == "Shrimp & Grits");
        SC_CHECK(parsed[1].allergens == std::vector<std::string>({"Milk", "Shellfish", "Wheat"}));
    }
    std::cout << "  ✓ Mock HTML, trace macros, multi-hall IDs, and Big-9 allergens parsed accurately.\n";
}

void testNutritionCalculator() {
    std::cout << "[TEST] Running NutritionCalculator tests...\n";

    sodium::MenuItem saltyDish;
    saltyDish.id = "test-1";
    saltyDish.name = "Super Salty Ramen";
    saltyDish.sodium_mg = 2400.0;
    saltyDish.calories = 600.0;
    saltyDish.satFat_g = 10.0;
    saltyDish.sugar_g = 5.0;
    saltyDish.protein_g = 30.0;

    sodium::MenuItem sideSalad;
    sideSalad.id = "test-2";
    sideSalad.name = "House Greens";
    sideSalad.sodium_mg = 50.0;
    sideSalad.calories = 40.0;
    sideSalad.satFat_g = 0.0;
    sideSalad.sugar_g = 1.0;
    sideSalad.protein_g = 25.0;

    sodium::MenuItem zeroQtyItem;
    zeroQtyItem.id = "test-zero";
    zeroQtyItem.name = "Removed Item";
    zeroQtyItem.sodium_mg = 5000.0;

    std::vector<sodium::TrayItem> cart;
    cart.emplace_back(saltyDish, 1.0);
    cart.emplace_back(sideSalad, 1.0);
    cart.emplace_back(zeroQtyItem, 0.0); // Should be ignored completely

    auto summary = sodium::NutritionCalculator::calculateTraySummary(cart);

    SC_CHECK(summary.totalItemsCount == 2);
    SC_CHECK_NEAR(summary.totalServingsCount, 2.0, 0.01);
    SC_CHECK_NEAR(summary.totals.sodium_mg, 2450.0, 0.01);
    SC_CHECK_NEAR(summary.totals.calories, 640.0, 0.01);
    SC_CHECK(summary.sodiumAlertState == "exceeded");
    SC_CHECK(summary.sodiumPercentDV > 100.0);

    // Check Protein floor achieved (55g / 50g = 110% -> "achieved") and visualHeightPct
    bool checkedProtein = false;
    for (const auto& pdv : summary.percentDV) {
        if (pdv.key == "protein_g") {
            checkedProtein = true;
            SC_CHECK(pdv.status == "achieved");
            SC_CHECK_NEAR(pdv.percent, 110.0, 0.1);
            SC_CHECK_NEAR(pdv.visualHeightPct, 73.3, 0.2);
        }
    }
    SC_CHECK(checkedProtein);

    // Verify top offenders
    bool foundSodiumOffender = false;
    for (const auto& offender : summary.topOffenders) {
        if (offender.metricKey == "sodium_mg") {
            foundSodiumOffender = true;
            SC_CHECK(offender.itemName == "Super Salty Ramen");
            SC_CHECK_NEAR(offender.amountContributed, 2400.0, 0.01);
        }
    }
    SC_CHECK(foundSodiumOffender);

    // Test custom Low-Sodium Heart Healthy benchmark (1,500 mg limit -> 1,300 mg triggers "warning" at 86.7%)
    std::vector<sodium::FDABenchmark> lowSodiumBm = {
        {"sodium_mg", "Sodium", 1500.0, "mg", true}
    };
    sodium::MenuItem soup;
    soup.id = "soup-1";
    soup.name = "Tomato Bisque";
    soup.sodium_mg = 1300.0;
    auto lowNaSummary = sodium::NutritionCalculator::calculateTraySummary({sodium::TrayItem(soup, 1.0)}, lowSodiumBm);
    SC_CHECK(lowNaSummary.sodiumAlertState == "warning");
    SC_CHECK_NEAR(lowNaSummary.sodiumPercentDV, 86.7, 0.1);

    std::cout << "  ✓ Aggregation, %DV, visualHeightPct, custom benchmarks, and TopOffender verified.\n";
}

void testJsonRoundtrip() {
    std::cout << "[TEST] Running JSON Roundtrip tests...\n";

    sodium::MenuItem item;
    item.id = "sc-101";
    item.name = "Michigan Blueberry Muffin";
    item.mealPeriod = "breakfast";
    item.station = "MBakery";
    item.servingSize = "1 Muffin (90g)";
    item.calories = 320;
    item.sodium_mg = 310;
    item.tags = {"Vegetarian"};
    item.allergens = {"Eggs", "Milk", "Wheat"};

    sodium::DailyMenuPayload payload;
    payload.date = "2026-11-21";
    payload.hall = "South Quad Dining Hall";
    payload.hallSlug = "south-quad";
    payload.isFallback = true;
    payload.itemCount = 1;
    payload.items = {item};

    nlohmann::json pj = payload;
    sodium::DailyMenuPayload restoredPayload = pj.get<sodium::DailyMenuPayload>();

    SC_CHECK(restoredPayload.hallSlug == "south-quad");
    SC_CHECK(restoredPayload.isFallback == true);
    SC_CHECK(restoredPayload.items.size() == 1);
    SC_CHECK(restoredPayload.items[0] == item);

    auto summary = sodium::NutritionCalculator::calculateTraySummary({sodium::TrayItem(item, 2.0)});
    nlohmann::json sj = summary;
    sodium::TraySummary restoredSummary = sj.get<sodium::TraySummary>();
    SC_CHECK(restoredSummary.totalItemsCount == 1);
    SC_CHECK_NEAR(restoredSummary.totals.sodium_mg, 620.0, 0.01);
    SC_CHECK(!restoredSummary.percentDV.empty() && restoredSummary.percentDV[0].visualHeightPct > 0.0);

    std::cout << "  ✓ JSON serialization & deserialization roundtrips verified.\n";
}

int main() {
    std::cout << "========================================\n";
    std::cout << "Running SodiumController C++ Engine Tests\n";
    std::cout << "========================================\n";
    testHtmlUtilitiesAndEntities();
    testHtmlParserAndAllergens();
    testNutritionCalculator();
    testJsonRoundtrip();
    std::cout << "========================================\n";
    if (g_failedChecks > 0) {
        std::cerr << "FAILED " << g_failedChecks << " CHECK(S) (" << g_passedChecks << " passed).\n";
        return 1;
    }
    std::cout << "ALL " << g_passedChecks << " CHECKS PASSED SUCCESSFULLY! ✓✓✓\n";
    std::cout << "========================================\n";
    return 0;
}
