// User roles demo
#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

class User {
public:
    User(std::string name, std::vector<std::string> roles)
        : name_(std::move(name)), roles_(std::move(roles)) {}

    bool isAdmin() const {
        return std::find(roles_.begin(), roles_.end(), "admin") != roles_.end();
    }

    const std::string &name() const { return name_; }

private:
    std::string name_;
    std::vector<std::string> roles_;
};

int sumEven(const std::vector<int> &nums) {
    int total = 0;
    for (int n : nums) {
        if (n % 2 == 0) total += n;
    }
    return total;
}

int main() {
    User ada{"Ada", {"admin", "editor"}};
    std::cout << ada.name() << " admin=" << ada.isAdmin()
              << " evenSum=" << sumEven({1, 2, 3, 4}) << "\n";
}
