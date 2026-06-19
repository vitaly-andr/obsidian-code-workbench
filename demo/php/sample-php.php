<?php
// User roles demo
const GREETING = "Hello";

class User
{
    public function __construct(
        public string $name,
        public array $roles
    ) {}

    public function isAdmin(): bool
    {
        return in_array("admin", $this->roles, true);
    }
}

function describe(User $user): string
{
    return GREETING . ", " . $user->name . " has " . count($user->roles) . " roles";
}

function sumEven(array $nums): int
{
    return array_sum(array_filter($nums, fn($n) => $n % 2 === 0));
}

$users = [new User("Ada", ["admin", "editor"]), new User("Bob", ["viewer"])];
echo describe($users[0]), PHP_EOL;
echo "evenSum: ", sumEven([1, 2, 3, 4]), PHP_EOL;
