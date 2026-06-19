# User roles demo
greeting <- "Hello"

make_user <- function(name, roles) {
  list(name = name, roles = roles)
}

is_admin <- function(user) {
  "admin" %in% user$roles
}

describe <- function(user) {
  sprintf("%s has %d roles", user$name, length(user$roles))
}

sum_even <- function(nums) {
  sum(nums[nums %% 2 == 0])
}

users <- list(
  make_user("Ada", c("admin", "editor")),
  make_user("Bob", c("viewer"))
)

cat(describe(users[[1]]), "admin=", is_admin(users[[1]]), "\n")
cat("evenSum:", sum_even(c(1, 2, 3, 4)), "\n")
