-- error: the function is missing its closing "end"
local function sumEven(nums)
    local total = 0
    for _, n in ipairs(nums) do
        total = total + n
    end
    return total

print(sumEven({ 1, 2, 3, 4 }))
