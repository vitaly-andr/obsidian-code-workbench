# error: the function header is missing its colon ":"
def describe(user)
    return f"{user.name} has {len(user.roles)} roles"

print(describe(None))
