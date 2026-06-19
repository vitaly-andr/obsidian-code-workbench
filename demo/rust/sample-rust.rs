// User roles demo
const GREETING: &str = "Hello";

struct User {
    name: String,
    roles: Vec<String>,
}

impl User {
    fn new(name: &str, roles: &[&str]) -> Self {
        User {
            name: name.to_string(),
            roles: roles.iter().map(|s| s.to_string()).collect(),
        }
    }
    fn is_admin(&self) -> bool {
        self.roles.iter().any(|r| r == "admin")
    }
}

fn describe(user: &User) -> String {
    format!("{}, {} has {} roles", GREETING, user.name, user.roles.len())
}

fn sum_even(nums: &[i32]) -> i32 {
    nums.iter().filter(|n| *n % 2 == 0).sum()
}

fn main() {
    let users = vec![User::new("Ada", &["admin", "editor"]), User::new("Bob", &["viewer"])];
    println!("{} admin={}", describe(&users[0]), users[0].is_admin());
    println!("evenSum: {}", sum_even(&[1, 2, 3, 4]));
}
