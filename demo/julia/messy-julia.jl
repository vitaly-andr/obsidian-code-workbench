# error: the function is missing its closing "end"
function describe(user)
    "$(user.name) has $(length(user.roles)) roles"

println(describe(nothing))
