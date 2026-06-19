# Mis-formatted on purpose. Run "Format code file".
GREETING="Hello"
class User:
    def __init__(self,name,roles):
        self.name=name;self.roles=roles
    @property
    def is_admin( self ):
        return "admin" in self.roles
def describe( user ):
    return f"{GREETING}, {user.name} has {len(user.roles)} roles"
def sum_even(nums): return sum(n for n in nums if n%2==0)
print( describe(User("Ada",["admin"])) , sum_even([1,2,3,4]) )
