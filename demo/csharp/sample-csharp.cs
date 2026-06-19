// User roles demo
using System;
using System.Collections.Generic;
using System.Linq;

record User(string Name, List<string> Roles)
{
    public bool IsAdmin => Roles.Contains("admin");
}

static class Program
{
    static string Describe(User user) =>
        $"{user.Name} has {user.Roles.Count} roles";

    static int SumEven(IEnumerable<int> nums) =>
        nums.Where(n => n % 2 == 0).Sum();

    static void Main()
    {
        var users = new List<User>
        {
            new("Ada", new() { "admin", "editor" }),
            new("Bob", new() { "viewer" }),
        };
        Console.WriteLine(Describe(users[0]) + " admin=" + users[0].IsAdmin);
        Console.WriteLine("evenSum: " + SumEven(new[] { 1, 2, 3, 4 }));
    }
}
