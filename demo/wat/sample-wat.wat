;; Sum of even numbers (WebAssembly text format)
(module
  (func $is_even (param $n i32) (result i32)
    local.get $n
    i32.const 1
    i32.and
    i32.eqz)

  (func $sum_even (param $a i32) (param $b i32) (result i32)
    (local $total i32)
    (if (call $is_even (local.get $a))
      (then
        (local.set $total (i32.add (local.get $total) (local.get $a)))))
    (if (call $is_even (local.get $b))
      (then
        (local.set $total (i32.add (local.get $total) (local.get $b)))))
    local.get $total)

  (export "sum_even" (func $sum_even)))
