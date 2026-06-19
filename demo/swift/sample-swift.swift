// User roles demo
struct User {
    let name: String
    let roles: [String]

    var isAdmin: Bool {
        roles.contains("admin")
    }
}

func describe(_ user: User) -> String {
    "\(user.name) has \(user.roles.count) roles"
}

func sumEven(_ nums: [Int]) -> Int {
    nums.filter { $0 % 2 == 0 }.reduce(0, +)
}

let users = [User(name: "Ada", roles: ["admin", "editor"]), User(name: "Bob", roles: ["viewer"])]
print(describe(users[0]), users[0].isAdmin)
print("evenSum:", sumEven([1, 2, 3, 4]))
