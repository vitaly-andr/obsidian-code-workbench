; inherits: html
;
; Highlights for the Blade layer only. The PHP inside {{ }}, {!! !!}, @php blocks
; and directive parameters is highlighted through injection (see injections.scm),
; so this query never tries to descend into PHP source.

; Blade directives  (@if @foreach @section @csrf @php ... )
[
  (directive)
  (directive_start)
  (directive_end)
  (conditional_keyword)
] @keyword

; Inline PHP open/close tags  <?php ... ?>
[
  (php_tag)
  (php_end_tag)
] @keyword

; Echo braces  {{ }}   {!! !!}
[
  "{{"
  "}}"
  "{!!"
  "!!}"
] @punctuation.special

; Comments  {{-- ... --}}
(comment) @comment

; HTML structure
(tag_name) @tag
(erroneous_end_tag_name) @tag
(attribute_name) @attribute
(attribute_value) @string
(entity) @constant.character.escape
(doctype) @constant

; Directive parameters (Blade arg text; PHP inside is injected)
(parameter) @variable

; Punctuation
[
  "<"
  ">"
  "</"
  "/>"
  "<!"
  "("
  ")"
] @punctuation.bracket

[
  "="
  ","
] @punctuation.delimiter

[
  "\""
  "'"
] @punctuation.delimiter
