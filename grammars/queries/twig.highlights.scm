; ------------------------------------------------------------------
; Twig highlights
; ------------------------------------------------------------------

; Comments
(comment) @comment
(inline_comment) @comment

; ------------------------------------------------------------------
; Delimiters: {{ }}, {% %}  (aliased to embedded_begin/embedded_end)
; ------------------------------------------------------------------
"embedded_begin" @keyword
"embedded_end" @keyword

; ------------------------------------------------------------------
; Tag keywords
;
; Statement keywords (set, for, if, block, ...) are aliased to an
; anonymous "keyword" token in the grammar. The dynamic `{% name %}`
; tag also stores its name under the field `name` as a "keyword".
; ------------------------------------------------------------------
"keyword" @keyword
(tag name: "keyword" @keyword)

; The `as` operator inside from/use is a keyword
(as_operator operator: "keyword" @keyword)

; ------------------------------------------------------------------
; Literals
; ------------------------------------------------------------------
(string) @string
(interpolated_string) @string
(number) @number
(boolean) @boolean
(null) @constant

; ------------------------------------------------------------------
; Variables, properties, parameters
; ------------------------------------------------------------------
(variable) @variable
(parameter) @variable
(property) @property
(member_expression property: (property) @property)

; Named argument keys are aliased to `string` in the grammar; surface
; them as properties for readability.
(named_argument key: (string) @property)

; ------------------------------------------------------------------
; Functions / filters / methods
; ------------------------------------------------------------------
(function) @function
(filter_expression name: (function) @function)
(call_expression name: (function) @function)

; A call whose target is a member access reads as a method call.
(call_expression
  name: (member_expression property: (property) @method))

; Macro definitions: name is a function, parameters are variables.
(macro name: (identifier) @function)

; Block names act as labels.
(block name: (identifier) @label)

; ------------------------------------------------------------------
; Operators
; ------------------------------------------------------------------
(binary_expression operator: _ @operator)
(unary_expression operator: _ @operator)
(member_expression operator: _ @operator)
(assignment_expression operator: _ @operator)

[
  "="
  "=>"
  "?"
  "?."
  "..."
] @operator

; ------------------------------------------------------------------
; Punctuation
; ------------------------------------------------------------------
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ":"
  "."
] @punctuation.delimiter
