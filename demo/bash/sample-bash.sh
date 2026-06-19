#!/usr/bin/env bash
# User roles demo
set -euo pipefail

GREETING="Hello"

is_admin() {
    local roles="$1"
    [[ ",$roles," == *",admin,"* ]]
}

sum_even() {
    local total=0
    for n in "$@"; do
        if (( n % 2 == 0 )); then
            total=$(( total + n ))
        fi
    done
    echo "$total"
}

main() {
    local name="Ada"
    local roles="admin,editor"
    if is_admin "$roles"; then
        echo "$GREETING, $name is an admin"
    fi
    echo "evenSum: $(sum_even 1 2 3 4)"
}

main "$@"
