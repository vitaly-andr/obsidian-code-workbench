// User roles demo
const std = @import("std");

const User = struct {
    name: []const u8,
    roles: []const []const u8,

    fn isAdmin(self: User) bool {
        for (self.roles) |role| {
            if (std.mem.eql(u8, role, "admin")) {
                return true;
            }
        }
        return false;
    }
};

fn sumEven(nums: []const i32) i32 {
    var total: i32 = 0;
    for (nums) |n| {
        if (@rem(n, 2) == 0) {
            total += n;
        }
    }
    return total;
}

pub fn main() void {
    const ada = User{ .name = "Ada", .roles = &.{ "admin", "editor" } };
    std.debug.print("{s} admin={} evenSum={}\n", .{ ada.name, ada.isAdmin(), sumEven(&.{ 1, 2, 3, 4 }) });
}
