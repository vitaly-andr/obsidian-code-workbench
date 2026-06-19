[
  "if"
  "elif"
  "else"
  "endif"
] @keyword.control.conditional

[
  "for"
  "endfor"
] @keyword.control.repeat

[
  "macro"
  "endmacro"
] @keyword.control.function

[
  "set"
  "endset"
] @keyword.storage.type

[
  "|"
  "or"
  "and"
  "is" "in"
  "==" "!="
  ">" ">=" "<" "<="
  "+" "-" "~"
  "/" "//" "%" "*"
  "**"
  "not"
  "="
] @operator

(control_for
  "in" @keyword.control.repeat)

[
  "(" ")"
  "[" "]"
  "{" "}"
] @punctuation.bracket

[
  ","
  ":"
  "."
] @punctuation.delimiter

[
  (control_begin)
  (control_end)
  (expression_begin)
  (expression_end)
] @tag

(identifier) @variable.other.template

(exp_bool) @constant.builtin.boolean
(exp_int) @constant.numeric.integer
(exp_string) @string

(exp_dict_item
  key: (exp_string) @variable.other.member)

(exp_field_access
  field: (identifier) @variable.other.member)

(exp_call
  function: (exp
    (identifier) @function))

(exp_binary
  op: "|"
  right: (exp
    (identifier) @function))

(exp_call
  function: (exp
    (exp_field_access
      field: (identifier) @function.method)))

(control_macro
  name: (identifier) @function)

(control_macro_parameter
  parameter: (identifier) @variable.parameter)

(exp_call_argument
  argument: (identifier) @variable.parameter)

(comment) @comment
