-- Mis-formatted on purpose. Run "Format code file".
local GREETING="Hello"
local User={} User.__index=User
function User.new(name,roles) return setmetatable({name=name,roles=roles},User) end
function User:isAdmin() for _,r in ipairs(self.roles) do if r=="admin" then return true end end return false end
local function sumEven(nums) local t=0 for _,n in ipairs(nums) do if n%2==0 then t=t+n end end return t end
local ada=User.new("Ada",{"admin"}) print(ada:isAdmin(),sumEven({1,2,3,4}))
