-- error: the expression is missing a closing parenthesis )
module Sample where

sumEven :: [Int] -> Int
sumEven = sum . filter even

main :: IO ()
main = putStrLn (show (sumEven [1, 2, 3, 4]
