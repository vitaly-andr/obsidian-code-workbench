// error: the class declaration is missing its closing brace and semicolon };
class User {
public:
    bool isAdmin() const { return true; }
private:
    std::string name_;

int main() { return 0; }
