#pragma once

#include "menu_item.hpp"
#include <string>
#include <string_view>
#include <vector>

namespace sodium {

class HtmlParser {
public:
    // Parses Bursley M|Dining HTML payload and extracts all menu items with nutrition facts
    static std::vector<MenuItem> parseBursleyHtml(const std::string& html);

    // Returns fallback Bursley menu items for offline testing or when dining is closed
    static std::vector<MenuItem> getFallbackBursleyMenu();

    // Utility methods
    static std::string stripHtml(std::string_view html);
    static std::string unescapeHtml(std::string_view input);
    static double extractNumber(const std::string& text, const std::string& pattern);
};

} // namespace sodium
