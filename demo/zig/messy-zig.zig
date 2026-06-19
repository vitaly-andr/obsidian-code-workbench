// error: the sumEven function body is missing its closing brace }
fn sumEven(nums: []const i32) i32 {
    var total: i32 = 0;
    for (nums) |n| {
        total += n;
    }
    return total;

pub fn main() void {}
