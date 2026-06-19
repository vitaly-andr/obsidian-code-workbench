;; error: the (defn sum-even ...) form is missing its closing paren
(defn sum-even [nums]
  (reduce + (filter even? nums))

(println (sum-even [1 2 3 4]))
