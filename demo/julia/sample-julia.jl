# User roles demo
struct User
    name::String
    roles::Vector{String}
end

isadmin(user::User) = "admin" in user.roles

function describe(user::User)
    "$(user.name) has $(length(user.roles)) roles"
end

sumeven(nums) = sum(n for n in nums if iseven(n))

users = [User("Ada", ["admin", "editor"]), User("Bob", ["viewer"])]
println(describe(users[1]), " admin=", isadmin(users[1]))
println("evenSum: ", sumeven([1, 2, 3, 4]))
