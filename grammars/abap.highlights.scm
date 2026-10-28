; ABAP highlights for the mkoval1/tree-sitter-abap grammar, maintained in this repo and published
; to the fork's grammars-v1 release by .github/workflows/build-abap-grammar.yml (it uploads THIS
; file as tree-sitter-abap.highlights.scm instead of the grammar's smaller upstream query).
;
; IMPORTANT: this grammar builds every keyword with kw(w) = alias(RegExp(w,"i"), w), so each keyword
; is an ANONYMOUS node whose name is the LOWERCASE word. Query rules must therefore use lowercase
; string literals (e.g. "class", not "CLASS") — ABAP source itself may be any case, but the node name
; the query matches is always lowercase. Only words the grammar actually lexes via kw(...) can match;
; words the grammar never tokenizes (CONCATENATE, COMMIT, DESCRIBE, …) are not in this grammar and
; adding them here would be dead weight. The keyword set below is the full kw(...) inventory of the
; pinned grammar (mkoval1@c7604df), 111 tokens.

; Reserved keywords (full kw() inventory of the grammar).
[
 "abstract"
 "all"
 "any"
 "append"
 "appending"
 "assigning"
 "at"
 "begin"
 "binary"
 "call"
 "catch"
 "changing"
 "check"
 "class"
 "class_constructor"
 "class-methods"
 "clear"
 "constructor"
 "continue"
 "corresponding"
 "create"
 "data"
 "default"
 "deferred"
 "definition"
 "enabled"
 "end"
 "endclass"
 "endfunction"
 "endif"
 "endinterface"
 "endloop"
 "endmethod"
 "endtry"
 "entries"
 "exception"
 "exceptions"
 "exit"
 "exporting"
 "fail"
 "field-symbols"
 "fields"
 "final"
 "for"
 "found"
 "friends"
 "from"
 "function"
 "global"
 "hashed"
 "if"
 "ignore"
 "implementation"
 "importing"
 "in"
 "include"
 "inheriting"
 "initial"
 "interface"
 "into"
 "is"
 "key"
 "like"
 "line"
 "local"
 "loop"
 "memory"
 "method"
 "methods"
 "no"
 "object"
 "of"
 "optional"
 "private"
 "protected"
 "public"
 "raise"
 "raising"
 "read"
 "read-only"
 "receiving"
 "redefinition"
 "ref"
 "reference"
 "report"
 "resumable"
 "returning"
 "rows"
 "search"
 "section"
 "select"
 "shared"
 "sorted"
 "standard"
 "step"
 "table"
 "to"
 "transporting"
 "try"
 "type"
 "up"
 "value"
 "where"
 "with"
 "write"
] @keyword

; RETURN reads as control flow, not a plain keyword.
"return" @keyword.return

; Word-form boolean operators.
[
 "and"
 "or"
 "not"
] @keyword.operator

; Word-form comparison operators the grammar tokenizes.
[
 "eq"
 "ne"
] @operator

; Symbolic operators (comparison + arithmetic) used in the grammar's expression rules.
[
 "="
 "<>"
 "+"
 "-"
 "*"
 "/"
 "**"
] @operator

; Type names: the grammar aliases the identifier after TYPE / TYPE REF TO to (type).
(type) @type

; A field symbol like <fs_data>.
(field_symbol_name) @variable

; Plain identifiers (variable/structure/component/parameter names). Broad on purpose; the (type)
; rule above specializes identifiers that sit in a typing position, and anonymous keyword nodes are
; matched by the keyword list above, so this does not recolour keywords.
(name) @variable

; Literals.
(character_literal) @string
(numeric_literal) @number

; Comments: full-line (* in column 1) and to-end-of-line (").
[
 (bol_comment)
 (eol_comment)
] @comment
