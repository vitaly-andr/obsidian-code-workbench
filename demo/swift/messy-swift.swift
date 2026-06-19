// error: the struct body is missing its closing brace }
struct User {
    let name: String
    let roles: [String]
    var isAdmin: Bool { roles.contains("admin") }

print("done")
