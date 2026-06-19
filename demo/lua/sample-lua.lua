-- User roles demo
local GREETING = "Hello"

local User = {}
User.__index = User

function User.new(name, roles)
    return setmetatable({ name = name, roles = roles }, User)
end

function User:isAdmin()
    for _, role in ipairs(self.roles) do
        if role == "admin" then
            return true
        end
    end
    return false
end

local function sumEven(nums)
    local total = 0
    for _, n in ipairs(nums) do
        if n % 2 == 0 then
            total = total + n
        end
    end
    return total
end

local ada = User.new("Ada", { "admin", "editor" })
print(GREETING, ada.name, ada:isAdmin())
print("evenSum", sumEven({ 1, 2, 3, 4 }))
