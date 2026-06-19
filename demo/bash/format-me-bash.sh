#!/usr/bin/env bash
# Mis-formatted on purpose. Run "Format code file".
GREETING="Hello"
is_admin(){ local roles="$1"; [[ ",$roles," == *",admin,"* ]]; }
sum_even(){ local total=0; for n in "$@"; do if (( n%2==0 )); then total=$((total+n)); fi; done; echo "$total"; }
main(){ if is_admin "admin,editor"; then echo "$GREETING admin"; fi; echo "$(sum_even 1 2 3 4)"; }
main "$@"
