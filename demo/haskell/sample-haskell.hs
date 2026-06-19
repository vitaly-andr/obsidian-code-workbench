-- User roles demo
module Sample where

data User = User
  { name  :: String
  , roles :: [String]
  }

isAdmin :: User -> Bool
isAdmin user = "admin" `elem` roles user

describe :: User -> String
describe user =
  name user ++ " has " ++ show (length (roles user)) ++ " roles"

sumEven :: [Int] -> Int
sumEven = sum . filter even

main :: IO ()
main = do
  let users = [User "Ada" ["admin", "editor"], User "Bob" ["viewer"]]
  putStrLn (describe (head users))
  putStrLn ("evenSum: " ++ show (sumEven [1, 2, 3, 4]))
