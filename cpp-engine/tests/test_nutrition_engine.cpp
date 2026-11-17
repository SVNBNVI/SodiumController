#include "menu_item.hpp"
#include "html_parser.hpp"
#include "nutrition_calculator.hpp"

#include <iostream>
#include <cassert>
#include <cmath>

void testHtmlParser() {
    std::cout << "[TEST] Running HtmlParser test...\n";
    auto fallback = sodium::HtmlParser::getFallbackBursleyMenu();
    assert(!fallback.empty());
    assert(fallback.size() >= 5);
    std::cout << "  ✓ Fallback menu contains " << fallback.size() << " verified items.\n";

    // Test simple mock HTML
    std::string mockHtml = R"(
        <div id="mdining-items">
            <h3><a href="#"><i class="fa fa-minus"></i> Breakfast</a></h3>
            <div class="courses">
                <h4>Hot Cereal</h4>
                <ul class="items">
                    <li class="trait-vegan">
                        <span class="item-name">Organic Steel Cut Oatmeal</span>
                        <div class="nutrition">
                            <table class="nutrition-facts">
                                <tr class="serving-size"><td>Serving Size 1 Cup (240g)</td></tr>
                                <tr class="portion-calories"><td>Calories 150</td></tr>
                                <tr><td>Total Fat 2.5g</td></tr>
                                <tr><td>Saturated Fat 0.5g</td></tr>
                                <tr><td>Trans Fat 0g</td></tr>
                                <tr><td>Cholesterol 0mg</td></tr>
                                <tr><td>Sodium 5mg</td></tr>
                                <tr><td>Total Carbohydrate 27g</td></tr>
                                <tr><td>Dietary Fiber 4g</td></tr>
                                <tr><td>Sugars 1g</td></tr>
                                <tr><td>Protein 5g</td></tr>
                            </table>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    )";

    auto parsed = sodium::HtmlParser::parseBursleyHtml(mockHtml);
    assert(parsed.size() == 1);
    assert(parsed[0].name == "Organic Steel Cut Oatmeal");
    assert(parsed[0].mealPeriod == "breakfast");
    assert(parsed[0].station == "Hot Cereal");
    assert(parsed[0].calories == 150.0);
    assert(parsed[0].sodium_mg == 5.0);
    assert(parsed[0].protein_g == 5.0);
    assert(!parsed[0].tags.empty() && parsed[0].tags[0] == "Vegan");
    std::cout << "  ✓ Mock HTML parsed with 100% precision.\n";

    // Test multi-hall parsing with custom slug ID
    auto southQuadParsed = sodium::HtmlParser::parseDiningHallHtml(mockHtml, "south-quad");
    assert(southQuadParsed.size() == 1);
    assert(southQuadParsed[0].id.find("sc-south-quad-") == 0);
    std::cout << "  ✓ Multi-hall parser correctly prefixes dining hall IDs.\n";
}

void testNutritionCalculator() {
    std::cout << "[TEST] Running NutritionCalculator test...\n";

    sodium::MenuItem saltyDish;
    saltyDish.id = "test-1";
    saltyDish.name = "Super Salty Ramen";
    saltyDish.sodium_mg = 2400.0;
    saltyDish.calories = 600.0;
    saltyDish.satFat_g = 10.0;
    saltyDish.sugar_g = 5.0;

    sodium::MenuItem sideSalad;
    sideSalad.id = "test-2";
    sideSalad.name = "House Greens";
    sideSalad.sodium_mg = 50.0;
    sideSalad.calories = 40.0;
    sideSalad.satFat_g = 0.0;
    sideSalad.sugar_g = 1.0;

    std::vector<sodium::TrayItem> cart;
    cart.emplace_back(saltyDish, 1.0);
    cart.emplace_back(sideSalad, 1.0);

    auto summary = sodium::NutritionCalculator::calculateTraySummary(cart);

    // Total sodium: 2450 mg
    assert(summary.totals.sodium_mg == 2450.0);
    assert(summary.totals.calories == 640.0);
    assert(summary.sodiumAlertState == "exceeded");
    assert(summary.sodiumPercentDV > 100.0);

    // Verify top offenders
    bool foundSodiumOffender = false;
    for (const auto& offender : summary.topOffenders) {
        if (offender.metricKey == "sodium_mg") {
            foundSodiumOffender = true;
            assert(offender.itemName == "Super Salty Ramen");
            assert(offender.amountContributed == 2400.0);
        }
    }
    assert(foundSodiumOffender);
    std::cout << "  ✓ Aggregation, %DV, sodiumAlertState, and TopOffender ranking verified.\n";
}

void testJsonRoundtrip() {
    std::cout << "[TEST] Running JSON Roundtrip test...\n";

    sodium::MenuItem item;
    item.id = "sc-101";
    item.name = "Michigan Blueberry Muffin";
    item.mealPeriod = "breakfast";
    item.station = "MBakery";
    item.servingSize = "1 Muffin (90g)";
    item.calories = 320;
    item.sodium_mg = 310;
    item.tags = {"Vegetarian"};

    nlohmann::json j = item;
    sodium::MenuItem restored = j.get<sodium::MenuItem>();

    assert(restored.id == item.id);
    assert(restored.name == item.name);
    assert(restored.calories == item.calories);
    assert(restored.sodium_mg == item.sodium_mg);
    assert(restored.tags == item.tags);

    std::cout << "  ✓ JSON serialization & deserialization roundtrip verified.\n";
}

int main() {
    std::cout << "========================================\n";
    std::cout << "Running SodiumController C++ Engine Tests\n";
    std::cout << "========================================\n";
    testHtmlParser();
    testNutritionCalculator();
    testJsonRoundtrip();
    std::cout << "========================================\n";
    std::cout << "ALL TESTS PASSED SUCCESSFULLY! ✓✓✓\n";
    std::cout << "========================================\n";
    return 0;
}
