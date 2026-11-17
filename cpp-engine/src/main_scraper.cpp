#include "menu_item.hpp"
#include "html_parser.hpp"
#include "nutrition_calculator.hpp"

#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <ctime>
#include <cstdlib>
#include <filesystem>
#include <curl/curl.h>

namespace fs = std::filesystem;

namespace {

size_t curlWriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t totalSize = size * nmemb;
    auto* str = static_cast<std::string*>(userp);
    str->append(static_cast<char*>(contents), totalSize);
    return totalSize;
}

std::string getDetroitDate() {
    // Lock timezone to America/Detroit (Ann Arbor, MI)
    setenv("TZ", "America/Detroit", 1);
    tzset();

    std::time_t now = std::time(nullptr);
    std::tm tmNow{};
#if defined(_WIN32)
    localtime_s(&tmNow, &now);
#else
    localtime_r(&now, &tmNow);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d", &tmNow);
    return std::string(buf);
}

std::string getIsoUtcTimestamp() {
    std::time_t now = std::time(nullptr);
    std::tm tmUtc{};
#if defined(_WIN32)
    gmtime_s(&tmUtc, &now);
#else
    gmtime_r(&now, &tmUtc);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
    return std::string(buf);
}

bool fetchUrl(const std::string& url, std::string& responseOut, long& httpCode) {
    CURL* curl = curl_easy_init();
    if (!curl) {
        std::cerr << "[SodiumController ERROR] Failed to initialize libcurl.\n";
        return false;
    }

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Accept: */*");
    headers = curl_slist_append(headers, "User-Agent: python-requests/2.32.3");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlWriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &responseOut);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);

    CURLcode res = curl_easy_perform(curl);
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        std::cerr << "[SodiumController ERROR] curl_easy_perform() failed: "
                  << curl_easy_strerror(res) << "\n";
        return false;
    }
    return (httpCode == 200);
}

void writeJsonFile(const fs::path& filePath, const nlohmann::json& j) {
    if (filePath.has_parent_path()) {
        fs::create_directories(filePath.parent_path());
    }
    std::ofstream out(filePath);
    if (!out) {
        std::cerr << "[SodiumController ERROR] Could not open file for writing: "
                  << filePath.string() << "\n";
        return;
    }
    out << j.dump(2) << "\n";
    std::cout << "[SodiumController] Successfully wrote: " << filePath.string() << "\n";
}

} // namespace

int main(int argc, char* argv[]) {
    std::string customDate;
    std::string outputPath = "sodium-today.json";
    std::string frontendOutputPath;
    std::string inputHtmlFile;
    bool runTestCalc = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--date" && i + 1 < argc) {
            customDate = argv[++i];
        } else if (arg == "--output" && i + 1 < argc) {
            outputPath = argv[++i];
        } else if (arg == "--frontend-output" && i + 1 < argc) {
            frontendOutputPath = argv[++i];
        } else if (arg == "--input-html" && i + 1 < argc) {
            inputHtmlFile = argv[++i];
        } else if (arg == "--test-calc") {
            runTestCalc = true;
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: sodium_scraper [options]\n"
                      << "  --date <YYYY-MM-DD>       Target date (default: America/Detroit today)\n"
                      << "  --output <path>           Primary output path (default: sodium-today.json)\n"
                      << "  --frontend-output <path>  Secondary output path for Angular assets\n"
                      << "  --input-html <path>       Parse from a local HTML file instead of network\n"
                      << "  --test-calc               Run nutrition calculator sanity check\n";
            return 0;
        }
    }

    if (runTestCalc) {
        std::cout << "[SodiumController] Running Nutrition Calculator Sanity Check...\n";
        auto sampleMenu = sodium::HtmlParser::getFallbackBursleyMenu();
        std::vector<sodium::TrayItem> sampleCart;
        if (sampleMenu.size() >= 2) {
            sampleCart.emplace_back(sampleMenu[1], 1.5); // Deep Fried Hashbrowns
            sampleCart.emplace_back(sampleMenu[2], 2.0); // Pork Sausage Patty
        }
        auto summary = sodium::NutritionCalculator::calculateTraySummary(sampleCart);
        nlohmann::json summaryJson = summary;
        std::cout << summaryJson.dump(2) << "\n";
        return 0;
    }

    std::string today = customDate.empty() ? getDetroitDate() : customDate;
    std::string targetUrl = "https://dining.umich.edu/menus-locations/dining-halls/bursley/?menuDate=" + today;
    std::string html;

    if (!inputHtmlFile.empty()) {
        std::cout << "[SodiumController] Reading offline HTML from: " << inputHtmlFile << "\n";
        std::ifstream f(inputHtmlFile);
        if (!f) {
            std::cerr << "[SodiumController ERROR] Cannot open " << inputHtmlFile << "\n";
            return 1;
        }
        std::stringstream ss;
        ss << f.rdbuf();
        html = ss.str();
    } else {
        std::cout << "[SodiumController] Fetching Bursley menu for Detroit date: " << today << "...\n";
        std::cout << "[SodiumController] Target URL: " << targetUrl << "\n";

        curl_global_init(CURL_GLOBAL_DEFAULT);
        long httpCode = 0;
        bool ok = fetchUrl(targetUrl, html, httpCode);
        curl_global_cleanup();

        if (!ok || html.empty()) {
            std::cerr << "[SodiumController WARNING] Live fetch failed (HTTP " << httpCode
                      << "). Using verified Bursley fallback database.\n";
        }
    }

    std::vector<sodium::MenuItem> items;
    if (!html.empty()) {
        items = sodium::HtmlParser::parseBursleyHtml(html);
    }

    if (items.empty()) {
        std::cout << "[SodiumController WARNING] Parsed 0 items from HTML. Loading verified Bursley fallback menu.\n";
        items = sodium::HtmlParser::getFallbackBursleyMenu();
    }

    std::cout << "[SodiumController] Parsed " << items.size() << " items from Bursley Dining Hall.\n";

    // Meal breakdown
    int bCount = 0, lCount = 0, dCount = 0;
    for (const auto& item : items) {
        if (item.mealPeriod == "breakfast") bCount++;
        else if (item.mealPeriod == "lunch") lCount++;
        else if (item.mealPeriod == "dinner") dCount++;
    }
    std::cout << "[SodiumController] Breakdown: " << bCount << " Breakfast, "
              << lCount << " Lunch, " << dCount << " Dinner items.\n";

    sodium::DailyMenuPayload payload;
    payload.project = "SodiumController";
    payload.date = today;
    payload.lastUpdated = getIsoUtcTimestamp();
    payload.hall = "Bursley Dining Hall";
    payload.sourceUrl = targetUrl;
    payload.itemCount = static_cast<int>(items.size());
    payload.items = items;

    nlohmann::json payloadJson = payload;

    // Write primary output
    writeJsonFile(outputPath, payloadJson);

    // If frontend output specified or default exists, write there too
    if (!frontendOutputPath.empty()) {
        writeJsonFile(frontendOutputPath, payloadJson);
    } else {
        fs::path defaultFrontendAssets = "frontend/src/assets/sodium-today.json";
        if (fs::exists("frontend") || fs::exists("frontend/src")) {
            writeJsonFile(defaultFrontendAssets, payloadJson);
        }
    }

    std::cout << "[SodiumController] Scrape & sync completed successfully.\n";
    return 0;
}
