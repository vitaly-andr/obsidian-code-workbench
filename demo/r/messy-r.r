# error: the function body is missing its closing brace }
describe <- function(user) {
  sprintf("%s has %d roles", user$name, length(user$roles))

cat(describe(NULL))
