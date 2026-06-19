;; User roles demo
(ns sample.users
  (:require [clojure.string :as str]))

(def greeting "Hello")

(defrecord User [name roles])

(defn admin? [user]
  (contains? (set (:roles user)) "admin"))

(defn describe [user]
  (str (:name user) " has " (count (:roles user)) " roles"))

(defn sum-even [nums]
  (reduce + (filter even? nums)))

(def users
  [(->User "Ada" ["admin" "editor"])
   (->User "Bob" ["viewer"])])

(println greeting (describe (first users)) "admin=" (admin? (first users)))
(println "evenSum:" (sum-even [1 2 3 4]) (str/join "," ["a" "b"]))
