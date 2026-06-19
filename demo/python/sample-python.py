# User roles demo
GREETING = "Hello"


class User:
    def __init__(self, name, roles):
        self.name = name
        self.roles = roles

    @property
    def is_admin(self):
        return "admin" in self.roles


def describe(user):
    return f"{GREETING}, {user.name} has {len(user.roles)} roles"


def sum_even(nums):
    return sum(n for n in nums if n % 2 == 0)


users = [User("Ada", ["admin", "editor"]), User("Bob", ["viewer"])]
print(describe(users[0]), users[0].is_admin)
print("evenSum:", sum_even([1, 2, 3, 4]))
