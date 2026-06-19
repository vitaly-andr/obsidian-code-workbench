// Mis-formatted on purpose. Run "Format code file".
const std=@import("std");
const User=struct{name:[]const u8,roles:[]const []const u8,
fn isAdmin(self:User) bool{for(self.roles)|r|{if(std.mem.eql(u8,r,"admin")){return true;}}return false;}};
fn sumEven(nums:[]const i32) i32{var t:i32=0;for(nums)|n|{if(@rem(n,2)==0){t+=n;}}return t;}
pub fn main() void{std.debug.print("{}\n",.{sumEven(&.{1,2,3,4})});}
