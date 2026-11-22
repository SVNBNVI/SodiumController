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
#include <cctype>
#include <filesystem>
#include <curl/curl.h>

namespace fs = std::filesystem;

namespace {

constexpr size_t MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB payload cap to prevent memory exhaustion

size_t curlWriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t totalSize = size * nmemb;
    auto* str = static_cast<std::string*>(userp);
    if (str->size() + totalSize > MAX_RESPONSE_BYTES) {
        std::cerr << "[SodiumController WARNING] Upstream response exceeded 5 MB cap; aborting to prevent memory exhaustion.\n";
        return 0; // Returning 0 causes libcurl to abort transfer with CURLE_WRITE_ERROR
    }
    str->append(static_cast<char*>(contents), totalSize);
    return totalSize;
}

bool isValidDateFormat(const std::string& d) {
    if (d.size() != 10 || d[4] != '-' || d[7] != '-') return false;
    for (size_t i = 0; i < d.size(); ++i) {
        if (i == 4 || i == 7) continue;
        if (!std::isdigit(static_cast<unsigned char>(d[i]))) return false;
    }
    return true;
}

std::string getDetroitDate() {
    // Lock timezone to America/Detroit (Ann Arbor, MI)
#if defined(_WIN32)
    _putenv_s("TZ", "EST5EDT");
    _tzset();
#else
    setenv("TZ", "America/Detroit", 1);
    tzset();
#endif

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
    curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 5L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);

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

bool writeJsonFile(const fs::path& filePath, const nlohmann::json& j) {
    if (filePath.has_parent_path()) {
        fs::create_directories(filePath.parent_path());
    }
    std::ofstream out(filePath);
    if (!out) {
        std::cerr << "[SodiumController ERROR] Could not open file for writing: "
                  << filePath.string() << "\n";
        return false;
    }
    out << j.dump(2) << "\n";
    std::cout << "[SodiumController] Successfully wrote: " << filePath.string() << "\n";
    return true;
}

bool hasExistingLiveMenuForToday(const fs::path& filePath, const std::string& today) {
    if (!fs::exists(filePath)) return false;
    try {
        std::ifstream in(filePath);
        if (!in) return false;
        nlohmann::json j = nlohmann::json::parse(in);
        sodium::DailyMenuPayload existing = j.get<sodium::DailyMenuPayload>();
        return (existing.date == today && !existing.isFallback && !existing.items.empty());
    } catch (...) {
        return false;
    }
}

struct HallInfo {
    std::string slug;
    std::string name;
};

const std::vector<HallInfo> ALL_HALLS = {
    {"bursley", "Bursley Dining Hall"},
    {"south-quad", "South Quad Dining Hall"},
    {"east-quad", "East Quad Dining Hall"},
    {"mosher-jordan", "Mosher-Jordan Dining Hall"},
    {"north-quad", "North Quad Dining Hall"},
    {"markley", "Markley Dining Hall"}
};

const HallInfo* findHall(const std::string& slug) {
    for (const auto& h : ALL_HALLS) {
        if (h.slug == slug) return &h;
    }
    return nullptr;
}

bool scrapeHall(const HallInfo& hall,
                const std::string& today,
                const std::string& inputHtmlFile,
                const std::string& outputPath,
                const std::string& frontendOutputPath,
                bool isAllHallsMode,
                bool offlineFallbackOnly) {
    std::string targetUrl = "https://dining.umich.edu/menus-locations/dining-halls/" + hall.slug + "/?menuDate=" + today;
    std::string hallAssetPath = "frontend/src/assets/menus/" + hall.slug + "-today.json";
    std::string html;

    if (!offlineFallbackOnly) {
        if (!inputHtmlFile.empty()) {
            std::cout << "[SodiumController] Reading offline HTML from: " << inputHtmlFile << " for " << hall.name << "\n";
            std::ifstream f(inputHtmlFile);
            if (!f) {
                std::cerr << "[SodiumController ERROR] Cannot open " << inputHtmlFile << "\n";
                return false;
            }
            std::stringstream ss;
            ss << f.rdbuf();
            html = ss.str();
        } else {
            std::cout << "[SodiumController] Fetching " << hall.name << " menu for Detroit date: " << today << "...\n";
            std::cout << "[SodiumController] Target URL: " << targetUrl << "\n";

            long httpCode = 0;
            bool ok = fetchUrl(targetUrl, html, httpCode);

            if (!ok || html.empty()) {
                std::cerr << "[SodiumController WARNING] Live fetch failed for " << hall.name
                          << " (HTTP " << httpCode << ").\n";
            }
        }
    }

    std::vector<sodium::MenuItem> items;
    if (!html.empty()) {
        items = sodium::HtmlParser::parseDiningHallHtml(html, hall.slug);
    }

    bool usingFallback = false;
    if (items.empty()) {
        // Never overwrite an already-valid live menu for today on transient network failure
        if (inputHtmlFile.empty() && !offlineFallbackOnly && hasExistingLiveMenuForToday(hallAssetPath, today)) {
            std::cout << "[SodiumController] Preserving existing live menu for " << hall.name
                      << " (" << today << ") rather than overwriting with fallback.\n";
            return true;
        }
        std::cout << "[SodiumController WARNING] 0 live items for " << hall.name
                  << "; loading verified " << hall.name << " fallback menu.\n";
        items = sodium::HtmlParser::getFallbackMenuForHall(hall.slug);
        usingFallback = true;
    }

    std::cout << "[SodiumController] Loaded " << items.size() << " items for " << hall.name
              << (usingFallback ? " (fallback)" : " (live)") << ".\n";

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
    payload.hall = hall.name;
    payload.hallSlug = hall.slug;
    payload.sourceUrl = targetUrl;
    payload.isFallback = usingFallback;
    payload.itemCount = static_cast<int>(items.size());
    payload.items = std::move(items);

    nlohmann::json payloadJson = payload;

    // 1. Write hall-specific file in frontend assets/menus/
    bool wroteOk = writeJsonFile(hallAssetPath, payloadJson);

    // 2. If bursley (default), also write root sodium-today.json and frontend/src/assets/sodium-today.json
    if (hall.slug == "bursley") {
        std::string primaryOut = outputPath.empty() ? "sodium-today.json" : outputPath;
        wroteOk = writeJsonFile(primaryOut, payloadJson) && wroteOk;

        std::string feOut = frontendOutputPath.empty() ? "frontend/src/assets/sodium-today.json" : frontendOutputPath;
        wroteOk = writeJsonFile(feOut, payloadJson) && wroteOk;
    } else if (!isAllHallsMode) {
        if (!outputPath.empty()) {
            wroteOk = writeJsonFile(outputPath, payloadJson) && wroteOk;
        }
        if (!frontendOutputPath.empty()) {
            wroteOk = writeJsonFile(frontendOutputPath, payloadJson) && wroteOk;
        }
    }

    return wroteOk;
}

} // namespace

int main(int argc, char* argv[]) {
    std::string customDate;
    std::string targetHall = "bursley";
    bool allHalls = false;
    bool offlineFallbackOnly = false;
    std::string outputPath;
    std::string frontendOutputPath;
    std::string inputHtmlFile;
    bool runTestCalc = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--date" && i + 1 < argc) {
            customDate = argv[++i];
            if (!isValidDateFormat(customDate)) {
                std::cerr << "[SodiumController ERROR] Invalid --date '" << customDate
                          << "'. Expected YYYY-MM-DD.\n";
                return 1;
            }
        } else if (arg == "--hall" && i + 1 < argc) {
            targetHall = argv[++i];
        } else if (arg == "--all-halls") {
            allHalls = true;
        } else if (arg == "--offline-fallback") {
            offlineFallbackOnly = true;
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
                      << "  --hall <slug>             Target dining hall slug (default: bursley)\n"
                      << "  --all-halls               Scrape all 6 Ann Arbor residential dining halls\n"
                      << "  --date <YYYY-MM-DD>       Target date (default: America/Detroit today)\n"
                      << "  --output <path>           Primary output path (default: sodium-today.json)\n"
                      << "  --frontend-output <path>  Secondary output path for Angular assets\n"
                      << "  --input-html <path>       Parse from a local HTML file instead of network\n"
                      << "  --offline-fallback        Write verified hall fallback menus without network\n"
                      << "  --test-calc               Run nutrition calculator sanity check\n"
                      << "\nAvailable dining halls:\n";
            for (const auto& h : ALL_HALLS) {
                std::cout << "  - " << h.slug << " (" << h.name << ")\n";
            }
            return 0;
        }
    }

    if (runTestCalc) {
        std::cout << "[SodiumController] Running Nutrition Calculator Sanity Check...\n";
        auto sampleMenu = sodium::HtmlParser::getFallbackBursleyMenu();
        std::vector<sodium::TrayItem> sampleCart;
        if (sampleMenu.size() >= 3) {
            sampleCart.emplace_back(sampleMenu[1], 1.5); // Deep Fried Hashbrowns
            sampleCart.emplace_back(sampleMenu[2], 2.0); // Pork Sausage Patty
        }
        auto summary = sodium::NutritionCalculator::calculateTraySummary(sampleCart);
        nlohmann::json summaryJson = summary;
        std::cout << summaryJson.dump(2) << "\n";
        return 0;
    }

    std::string today = customDate.empty() ? getDetroitDate() : customDate;

    if (!offlineFallbackOnly && inputHtmlFile.empty()) {
        curl_global_init(CURL_GLOBAL_DEFAULT);
    }

    bool overallOk = true;
    if (allHalls) {
        std::cout << "[SodiumController] Syncing ALL dining halls for Detroit date: " << today << "\n";
        int successCount = 0;
        for (const auto& hall : ALL_HALLS) {
            std::cout << "\n----------------------------------------\n";
            bool ok = scrapeHall(hall, today, inputHtmlFile, outputPath, frontendOutputPath, true, offlineFallbackOnly);
            if (ok) successCount++;
        }
        std::cout << "\n----------------------------------------\n";
        std::cout << "[SodiumController] Completed " << successCount << "/" << ALL_HALLS.size() << " dining halls.\n";
        overallOk = (successCount == static_cast<int>(ALL_HALLS.size()));
    } else {
        const HallInfo* hall = findHall(targetHall);
        HallInfo customHallInfo;
        if (!hall) {
            std::cout << "[SodiumController WARNING] Unknown hall slug '" << targetHall << "'. Using custom slug.\n";
            customHallInfo = {targetHall, targetHall + " Dining Hall"};
            hall = &customHallInfo;
        }
        overallOk = scrapeHall(*hall, today, inputHtmlFile, outputPath, frontendOutputPath, false, offlineFallbackOnly);
    }

    if (!offlineFallbackOnly && inputHtmlFile.empty()) {
        curl_global_cleanup();
    }

    std::cout << "[SodiumController] Scrape & sync completed.\n";
    return overallOk ? 0 : 1;
}
